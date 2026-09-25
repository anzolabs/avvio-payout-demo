import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError } from '../avvio/avvio.error';
import { Payout, PendingApproval } from '../avvio/avvio.types';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { AccountsService } from '../payees/accounts.service';
import { PayeesService } from '../payees/payees.service';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { Withdrawal } from '../store/state.types';
import { toView } from './withdrawal-status';

/** Creating a withdrawal is one POST /payouts to one of the payee's saved accounts. */
@Injectable()
export class WithdrawalsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly repo: StateRepository,
    private readonly log: LogService,
    private readonly payees: PayeesService,
    private readonly accounts: AccountsService,
  ) {}

  list() {
    return Object.values(this.repo.state.withdrawals)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toView);
  }

  get(id: string) {
    const wd = this.repo.state.withdrawals[id];
    if (!wd) throw new NotFoundException('not found');
    return toView(wd);
  }

  async create(payeeId: string, amount: string, destinationAccountId: string): Promise<Withdrawal> {
    if (!this.config.avvio.configured) throw new ServiceUnavailableException('backend is not configured: set AVVIO_API_KEY and AVVIO_ORG_ID in .env');
    const payee = this.payees.byId(payeeId);
    if (!payee) throw new NotFoundException('unknown payee');
    const account = this.accounts.find(payeeId, destinationAccountId);
    if (!account) throw new ConflictException("choose one of the payee's saved accounts first");

    const id = 'wd_' + randomBytes(5).toString('hex');
    const now = new Date().toISOString();
    const wd: Withdrawal = {
      id,
      payeeId,
      payeeName: payee.name,
      amount,
      currency: this.config.currency,
      destinationAccountId,
      last4: account.last4,
      reference: `DEMO-${id.slice(3)}`,
      idempotencyKey: randomUUID(),
      status: 'creating',
      timeline: [{ at: now, source: 'app', status: 'creating', note: `${payee.name} asked for $${amount} into ····${account.last4}` }],
      createdAt: now,
      updatedAt: now,
    };
    // Persisted BEFORE the request goes out. If the process dies mid-call, the
    // retry after restart reuses this key and gets the same payout back.
    this.repo.state.withdrawals[id] = wd;
    this.repo.save();

    const body = {
      amount,
      destinationAccountId,
      reference: wd.reference,
      // No `endUser`: the business is the sender of record. Set it to the
      // business's own customer if you want per-customer attribution or caps.
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await this.avvio.createPayout(body, wd.idempotencyKey);
        wd.updatedAt = new Date().toISOString();
        if (r.status === 202) {
          this.held(wd, r.body as PendingApproval, r.requestId);
        } else {
          this.sent(wd, r.body as Payout, r.replayed, r.requestId);
        }
        this.repo.save();
        return wd;
      } catch (e) {
        if (e instanceof AvvioError) {
          // The API answered. Whatever it said is final for this attempt.
          wd.status = 'error';
          wd.error = { type: e.type, message: e.message, requestId: e.requestId, errors: e.errors };
          wd.timeline.push({ at: new Date().toISOString(), source: 'api', status: 'error', note: `${e.status} ${e.type}` });
          this.log.log('api', `POST /payouts refused: ${e.status} ${e.type}`, { requestId: e.requestId, body: e.body });
          this.repo.save();
          return wd;
        }
        // Network failure or timeout: an unknown outcome, not a failure. Same key.
        const message = e instanceof Error ? e.message : String(e);
        this.log.log('api', `POST /payouts attempt ${attempt} failed (${message}); retrying with the same Idempotency-Key`);
        if (attempt === 2) {
          wd.status = 'error';
          wd.error = { type: 'NETWORK', message };
          this.repo.save();
          return wd;
        }
      }
    }
    return wd;
  }

  /** 202: held for a human. Nothing was priced or sent. */
  private held(wd: Withdrawal, approval: PendingApproval, requestId: string | null): void {
    wd.approvalId = approval.approvalId;
    wd.approvalExpiresAt = approval.expiresAt;
    wd.status = 'awaiting_approval';
    wd.timeline.push({ at: wd.updatedAt, source: 'api', status: 'awaiting_approval', note: `POST /payouts → 202, approval ${approval.approvalId} needs ${approval.requiredApprovals} approver(s)` });
    this.log.log('api', `payout for ${wd.id} held for approval ${approval.approvalId}`, { requestId });
  }

  /** 200: sent. `pending` on Avvio's side is `sent` on ours. */
  private sent(wd: Withdrawal, payout: Payout, replayed: boolean, requestId: string | null): void {
    wd.payoutId = payout.payoutId;
    wd.status = 'sent';
    if (payout.destinationAmount) {
      wd.destinationAmount = payout.destinationAmount.amount;
      wd.destinationCurrency = payout.destinationAmount.currency;
    }
    if (payout.fee) wd.fee = payout.fee.amount;
    wd.timeline.push({ at: wd.updatedAt, source: 'api', status: 'sent', note: `POST /payouts → 200${replayed ? ' (replayed, same payout)' : ''}` });
    this.log.log('api', `payout ${wd.payoutId} sent for ${wd.id} (${wd.reference})${replayed ? ', replayed' : ''}`, { requestId });
  }
}

