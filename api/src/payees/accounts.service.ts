import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEST_CLABES } from '../visitor';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError, isUnknownOutcome } from '../avvio/avvio.error';
import { Beneficiary, PaymentMethod, PaymentMethodInput } from '../avvio/avvio.types';
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
  bank: string | null;
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
  async add(payeeId: string, details: Record<string, string>, requestId: string): Promise<AccountView> {
    const payee = this.payees.byId(payeeId);
    if (!payee) throw new NotFoundException('unknown payee');
    // Only what a corridor form can produce: field ids to short strings. Anything
    // else is refused here rather than forwarded.
    const entries = Object.entries(details);
    if (!entries.length || entries.some(([k, v]) => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k) || typeof v !== 'string' || v.length > 128)) {
      throw new BadRequestException('details must map corridor field ids to strings of at most 128 characters');
    }
    const state = this.repo.state;
    // The payee's methods on Avvio before this request was FIRST sent, by id,
    // so the one it adds can be told apart from the ones it already had. A
    // retry reuses the stored snapshot: a fresh one would already contain the
    // account the lost first attempt registered.
    const pending = (state.pendingRegistrations ??= {});
    if (!pending[requestId]) {
      pending[requestId] = [...(await this.methodIds(payeeId))];
      this.repo.save();
    }
    const before = new Set(pending[requestId]);
    // The hosted demo is public: only the sandbox's test accounts, never real bank details.
    if (this.config.publicDemo && !Object.values(details).some((v) => TEST_CLABES.includes(v.replace(/\D/g, '')))) {
      throw new BadRequestException(`This public demo only accepts the sandbox test accounts: ${TEST_CLABES.join(', ')}`);
    }
    const method: PaymentMethodInput = { kind: 'fiat', currency: this.config.currency, recipientDetails: details };
    // The app's id for this submission: a resubmit of the same form after a
    // timeout reuses it, so the account is registered once.
    const idempotencyKey = requestId;

    let beneficiary: Beneficiary;
    try {
      beneficiary = await this.register(payeeId, payee.name, payee.email, method, idempotencyKey);
    } catch (e) {
      const held = e instanceof AvvioError ? await this.alreadyHeld(payeeId, e) : undefined;
      if (held) {
        beneficiary = held;
      } else if (e instanceof AvvioError) {
        // A final refusal (4xx): nothing was registered, so the snapshot is
        // no longer needed. An unknown outcome keeps it for the retry.
        if (!isUnknownOutcome(e)) {
          delete pending[requestId];
          this.repo.save();
        }
        this.log.log('api', `register account refused: ${e.status} ${e.type}`, { requestId: e.requestId, errors: e.errors });
        throw new HttpException({ message: e.message, type: e.type, errors: e.errors }, e.status);
      } else {
        throw e;
      }
    }
    delete pending[requestId];

    const m = registeredMethod(beneficiary, before, details);
    if (!m?.destinationAccountId) {
      // Never guess which account to pay into. This happens only when the
      // payee already holds several accounts ending in the same four digits.
      this.log.log('api', `registered for ${payeeId}, but could not tell which of its accounts is the one just sent; refused to guess`);
      throw new HttpException({ message: 'Registered, but it is ambiguous which saved account this is. Remove duplicate accounts for this payee and try again.' }, 409);
    }
    const account: Account = { methodId: m.id, destinationAccountId: m.destinationAccountId, last4: m.last4 ?? null, bank: bankOf(details), currency: this.config.currency, registeredAt: new Date().toISOString() };
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

  /** Ids of the payee's payment methods on Avvio right now; empty if not registered yet. */
  private async methodIds(payeeId: string): Promise<Set<string>> {
    try {
      const b = await this.avvio.beneficiaryByExternalId(payeeId);
      return new Set((b.paymentMethods ?? []).map((m) => m.id));
    } catch (e) {
      if (e instanceof AvvioError && e.status === 404) return new Set();
      if (e instanceof AvvioError) {
        this.log.log('api', `GET /recipients/external/${payeeId} failed: ${e.status} ${e.type}`, { requestId: e.requestId });
        throw new HttpException({ message: e.message, type: e.type }, e.status);
      }
      throw e;
    }
  }

  /**
   * BANK_ACCOUNT_ALREADY_LINKED naming THIS payee's own beneficiary: the account
   * is already theirs (an earlier attempt registered it and the answer was
   * lost). Adopt it, named by the error, instead of failing. Owned by anyone
   * else, it stays an error.
   */
  private async alreadyHeld(payeeId: string, e: AvvioError): Promise<Beneficiary | undefined> {
    const body = e.body as { existingRecipientId?: string; existingMethodId?: string } | null;
    if (e.type !== 'BANK_ACCOUNT_ALREADY_LINKED' || !body?.existingMethodId) return undefined;
    const b = await this.avvio.beneficiaryByExternalId(payeeId).catch(() => undefined);
    if (!b || b.id !== body.existingRecipientId) return undefined;
    const method = b.paymentMethods.find((m) => m.id === body.existingMethodId);
    if (!method) return undefined;
    this.log.log('api', `account already registered for ${payeeId} (${method.last4 ?? '····'}); using it`, { requestId: e.requestId });
    return { ...b, method };
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
  bank: a.bank ?? null,
  currency: a.currency,
  registeredAt: a.registeredAt,
});

/**
 * The payment method this registration created or matched. Never "the last
 * one" or `paymentMethods[0]`: a payee with several accounts would be paid into
 * the wrong one.
 *
 * 1. The response names it (`method`): use that.
 * 2. Exactly one method is new since before the call: that one.
 * 3. Nothing is new (the same account sent again): the one existing method
 *    whose last four digits match what was sent.
 * Anything else is ambiguous and returns undefined, so the caller refuses.
 */
export function registeredMethod(b: Beneficiary, before: Set<string>, details: Record<string, string>): PaymentMethod | undefined {
  const methods = (b.paymentMethods ?? []).filter((m) => m.destinationAccountId);
  if (b.method?.id) return methods.find((m) => m.id === b.method!.id) ?? b.method;
  const fresh = methods.filter((m) => !before.has(m.id));
  if (fresh.length === 1) return fresh[0];
  if (fresh.length > 1) return undefined;
  const tail = sentTail(details);
  const same = tail ? methods.filter((m) => m.last4 === tail) : [];
  return same.length === 1 ? same[0] : undefined;
}

/** Last four digits of the account identifier that was sent. */
function sentTail(details: Record<string, string>): string | null {
  const digits = Object.values(details).map((v) => v.replace(/\D/g, '')).filter((v) => v.length >= 4);
  return digits.length ? digits.sort((x, y) => y.length - x.length)[0].slice(-4) : null;
}

// ponytail: the banks behind most CLABEs; an unknown prefix just shows no name. Banxico's full list if it matters.
const CLABE_BANKS: Record<string, string> = {
  '002': 'Banamex', '012': 'BBVA México', '014': 'Santander', '021': 'HSBC', '030': 'Banbajío', '036': 'Inbursa',
  '044': 'Scotiabank', '058': 'Banregio', '072': 'Banorte', '127': 'Banco Azteca', '137': 'BanCoppel', '646': 'STP', '722': 'Mercado Pago',
};

/** The bank a CLABE belongs to, from its first three digits. */
export function bankOf(details: Record<string, string>): string | null {
  const clabe = Object.values(details).map((v) => v.replace(/\D/g, '')).find((v) => v.length === 18);
  return clabe ? CLABE_BANKS[clabe.slice(0, 3)] ?? null : null;
}
