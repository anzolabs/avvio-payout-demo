import { HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError } from '../avvio/avvio.error';
import { Beneficiary, PaymentMethodInput } from '../avvio/avvio.types';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { Account } from '../store/state.types';
import { PayeesService } from './payees.service';

/** What the app may see: never the account number. */
export interface AccountView {
  id: string;
  destinationAccountId: string;
  last4: string | null;
  currency: string;
  registeredAt: string;
}

/**
 * A payee's bank accounts. The first one registers the payee with Avvio as a
 * beneficiary; every later one is another payment method on that beneficiary.
 * An account number passes through here exactly once, on the way to Avvio,
 * and is never stored or logged. What stays is ids and a last4.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly repo: StateRepository,
    private readonly log: LogService,
    private readonly payees: PayeesService,
  ) {}

  list(payeeId: string): AccountView[] {
    return (this.repo.state.accounts[payeeId] ?? []).map(toView);
  }

  find(payeeId: string, destinationAccountId: string): Account | undefined {
    return (this.repo.state.accounts[payeeId] ?? []).find((a) => a.destinationAccountId === destinationAccountId);
  }

  /** `details` is keyed by the corridor's field ids, exactly as the form rendered them. */
  async add(payeeId: string, details: Record<string, string>): Promise<AccountView> {
    const payee = this.payees.byId(payeeId);
    if (!payee) throw new NotFoundException('unknown payee');
    const state = this.repo.state;
    const known = new Set((state.accounts[payeeId] ?? []).map((a) => a.destinationAccountId));
    const method: PaymentMethodInput = { kind: 'fiat', currency: this.config.currency, recipientDetails: details };
    // Minted before the call. A retry after a crash would reuse it.
    const idempotencyKey = randomUUID();

    let beneficiary: Beneficiary;
    try {
      beneficiary = await this.register(payeeId, payee.name, payee.email, method, idempotencyKey);
    } catch (e) {
      if (e instanceof AvvioError) {
        this.log.log('api', `register account refused: ${e.status} ${e.type}`, { requestId: e.requestId, errors: e.errors });
        throw new HttpException({ message: e.message, type: e.type, errors: e.errors }, e.status);
      }
      throw e;
    }

    const m = newestMethod(beneficiary, known);
    if (!m.destinationAccountId) throw new HttpException({ message: 'registration returned no destinationAccountId' }, 502);
    const account: Account = { methodId: m.id, destinationAccountId: m.destinationAccountId, last4: m.last4 ?? null, currency: this.config.currency, registeredAt: new Date().toISOString() };
    state.recipients[payeeId] = beneficiary.id;
    state.accounts[payeeId] = [...(state.accounts[payeeId] ?? []).filter((a) => a.destinationAccountId !== account.destinationAccountId), account];
    this.repo.save();
    return toView(account);
  }

  /** Remove one account on both sides. */
  async remove(payeeId: string, methodId: string): Promise<AccountView[]> {
    const state = this.repo.state;
    const acc = (state.accounts[payeeId] ?? []).find((a) => a.methodId === methodId);
    if (acc) {
      try {
        await this.avvio.deleteMethod(state.recipients[payeeId], methodId);
        this.log.log('api', `DELETE /recipients/${state.recipients[payeeId]}/methods/${methodId} for ${payeeId}`);
      } catch (e) {
        if (!(e instanceof AvvioError) || e.status !== 404) throw e;
      }
      state.accounts[payeeId] = state.accounts[payeeId].filter((a) => a.methodId !== methodId);
      this.repo.save();
    }
    return this.list(payeeId);
  }

  /** First account: POST /recipients. Later ones: POST /recipients/{id}/methods. */
  private async register(payeeId: string, name: string, email: string, method: PaymentMethodInput, idempotencyKey: string): Promise<Beneficiary> {
    let recipientId = this.repo.state.recipients[payeeId];
    if (!recipientId) {
      try {
        // externalId is OUR id for them, so a repeat returns the same
        // beneficiary instead of a second one.
        const r = await this.avvio.createBeneficiary({ type: 'individual', name, email, externalId: payeeId, method }, idempotencyKey);
        this.log.log('api', `POST /recipients → ${r.status} for ${payeeId}${r.replayed ? ' (replayed)' : ''}`, { requestId: r.requestId });
        return r.body;
      } catch (e) {
        if (!(e instanceof AvvioError) || e.type !== 'BENEFICIARY_EXTERNAL_ID_CONFLICT') throw e;
        // Registered before with another account (a previous run of this
        // demo, say). Find them by our id and add the account instead.
        recipientId = (await this.avvio.beneficiaryByExternalId(payeeId)).id;
      }
    }
    const r = await this.avvio.addMethod(recipientId, method, idempotencyKey);
    this.log.log('api', `POST /recipients/${recipientId}/methods → ${r.status} for ${payeeId}`, { requestId: r.requestId });
    return r.body;
  }
}

const toView = (a: Account): AccountView => ({
  id: a.methodId,
  destinationAccountId: a.destinationAccountId,
  last4: a.last4,
  currency: a.currency,
  registeredAt: a.registeredAt,
});

/** The method the call just added: the one we did not already hold, else the last. */
function newestMethod(b: Beneficiary, known: Set<string>): { id: string; destinationAccountId: string | undefined; last4?: string } {
  const methods = b.paymentMethods ?? [];
  const fresh = methods.filter((m) => m.destinationAccountId && !known.has(m.destinationAccountId));
  const pick = (fresh.length ? fresh : methods).at(-1);
  return { id: pick?.id ?? '', destinationAccountId: pick?.destinationAccountId, last4: pick?.last4 };
}
