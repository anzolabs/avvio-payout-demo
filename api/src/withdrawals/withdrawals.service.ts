import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError, isUnknownOutcome } from '../avvio/avvio.error';
import { CreatePayoutBody, Payout, PendingApproval } from '../avvio/avvio.types';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { AccountsService } from '../payees/accounts.service';
import { PayeesService } from '../payees/payees.service';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { Withdrawal } from '../store/state.types';
import { applyPayout, toView, transition } from './withdrawal-status';

/** "12.5" → 1250. Amounts are validated as at most two decimals before this. */
const cents = (s: string): number => {
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
};

/** Creating a withdrawal is one POST /payouts to one of the payee's saved accounts. */
@Injectable()
export class WithdrawalsService {
  /** Withdrawals whose POST /payouts is in flight in this process. */
  private readonly inFlight = new Set<string>();

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

  /**
   * One tap in the app. `requestId` is the app's id for that tap: a double
   * tap, or the app retrying a request that timed out, returns the withdrawal
   * already created for it instead of paying twice.
   */
  async create(payeeId: string, amount: string, destinationAccountId: string, requestId: string, expectDestination?: string): Promise<Withdrawal> {
    if (!this.config.avvio.configured) throw new ServiceUnavailableException('backend is not configured: set AVVIO_API_KEY and AVVIO_ORG_ID in .env');
    const existing = Object.values(this.repo.state.withdrawals).find((w) => w.requestId === requestId);
    if (existing) {
      if (existing.payeeId !== payeeId || existing.amount !== amount || existing.destinationAccountId !== destinationAccountId) {
        throw new ConflictException('this requestId was already used for a different withdrawal');
      }
      return existing;
    }
    const payee = this.payees.byId(payeeId);
    if (!payee) throw new NotFoundException('unknown payee');
    const account = this.accounts.find(payeeId, destinationAccountId);
    if (!account) throw new ConflictException("choose one of the payee's saved accounts first");
    // Your rule, enforced on your backend: never pay out more than the payee
    // has earned. Avvio only checks your balance and your limits. Compared in
    // cents, not floats.
    if (cents(amount) > cents(payee.available)) throw new BadRequestException(`amount is more than ${payee.name} has available ($${payee.available})`);

    const id = 'wd_' + randomBytes(5).toString('hex');
    const now = new Date().toISOString();
    const wd: Withdrawal = {
      id,
      requestId,
      payeeId,
      payeeName: payee.name,
      amount,
      currency: this.config.currency,
      destinationAccountId,
      last4: account.last4,
      reference: `DEMO-${id.slice(3)}`,
      idempotencyKey: randomUUID(),
      expectDestination,
      status: 'creating',
      attempts: 0,
      timeline: [{ at: now, source: 'app', status: 'creating', note: `${payee.name} asked for $${amount} into ····${account.last4}` }],
      createdAt: now,
      updatedAt: now,
    };
    // Persisted BEFORE the request goes out. Every later attempt for this
    // withdrawal, including one after a restart, reuses this key and gets the
    // same payout back.
    this.repo.state.withdrawals[id] = wd;
    this.repo.save();
    await this.send(wd);
    return wd;
  }

  /**
   * POST /payouts with the withdrawal's stored key. Used for the first send and
   * for every resend of a withdrawal whose outcome is unknown.
   */
  async send(wd: Withdrawal): Promise<void> {
    if (this.inFlight.has(wd.id)) return;
    this.inFlight.add(wd.id);
    try {
      await this.sendOnce(wd);
    } finally {
      this.inFlight.delete(wd.id);
    }
  }

  /** True while this process is sending the withdrawal; the poller leaves it alone. */
  isSending(id: string): boolean {
    return this.inFlight.has(id);
  }

  private async sendOnce(wd: Withdrawal): Promise<void> {
    const body: CreatePayoutBody = {
      amount: wd.amount,
      destinationAccountId: wd.destinationAccountId,
      reference: wd.reference,
      // What the payee saw on the confirm screen. If the live rate has moved
      // further than maxDriftBps (default 200), Avvio refuses with
      // RATE_DRIFT_EXCEEDED instead of sending short.
      ...(wd.expectDestination ? { expectDestination: wd.expectDestination } : {}),
      // No `endUser`: the business is the sender of record. When you pay on
      // behalf of your own customer (an employer, a merchant), send
      // endUser: { id: <that customer's id> } for attribution and per-customer
      // caps. It is never the payee.
    };
    wd.attempts = (wd.attempts ?? 0) + 1;
    try {
      const r = await this.avvio.createPayout(body, wd.idempotencyKey);
      wd.updatedAt = new Date().toISOString();
      wd.nextAttemptAt = undefined;
      if (r.status === 202) this.held(wd, r.body as PendingApproval, r.requestId);
      else this.sent(wd, r.body as Payout, r.replayed, r.requestId);
    } catch (e) {
      if (isUnknownOutcome(e)) {
        // The payout may exist. Not a failure: look it up by reference and, if
        // it is not there, resend with the SAME key. Never a new one.
        const retryAfter = e instanceof AvvioError ? e.retryAfter : null;
        const waitS = retryAfter ?? Math.min(60, 5 * 2 ** Math.min(wd.attempts - 1, 4));
        wd.nextAttemptAt = new Date(Date.now() + waitS * 1000).toISOString();
        const why = e instanceof AvvioError ? `${e.status} ${e.type}` : e instanceof Error ? e.message : String(e);
        transition(wd, 'unknown', 'api', `outcome unknown (${why}); will check by reference, then resend with the same key`);
        this.log.log('api', `POST /payouts for ${wd.id}: outcome unknown (${why}); next check in ${waitS}s`, e instanceof AvvioError ? { requestId: e.requestId } : undefined);
      } else {
        // A 4xx: the API refused it and nothing was sent. Final for this withdrawal.
        const err = e as AvvioError;
        wd.error = { type: err.type, message: err.message, requestId: err.requestId, errors: err.errors };
        transition(wd, 'error', 'api', `${err.status} ${err.type}`);
        this.log.log('api', `POST /payouts refused: ${err.status} ${err.type}`, { requestId: err.requestId, body: err.body });
      }
    }
    this.repo.save();
  }

  /**
   * An `unknown` (or crashed-in-`creating`) withdrawal: find the payout by our
   * reference; if it is not there and nothing is pending approval, resend with
   * the same key. Called by the poller once `nextAttemptAt` has passed.
   */
  async resolve(wd: Withdrawal): Promise<void> {
    if (wd.nextAttemptAt && Date.parse(wd.nextAttemptAt) > Date.now()) return;
    const found = await this.avvio.payoutByReference(wd.reference);
    if (found) {
      applyPayout(wd, found, 'poll');
      this.repo.save();
      this.log.log('poll', `GET /orders?reference=${wd.reference} → ${found.payoutId} ${found.status}, ${wd.id} now ${wd.status}`);
      return;
    }
    if (wd.approvalId) {
      // Held for approval: re-sending would ask for a second approval.
      wd.nextAttemptAt = new Date(Date.now() + 30_000).toISOString();
      return;
    }
    this.log.log('poll', `no payout with reference ${wd.reference} yet; resending ${wd.id} with its original Idempotency-Key`);
    await this.send(wd);
  }

  /** 202: held for a human. Nothing was priced or sent. */
  private held(wd: Withdrawal, approval: PendingApproval, requestId: string | null): void {
    wd.approvalId = approval.approvalId;
    wd.approvalExpiresAt = approval.expiresAt;
    transition(wd, 'awaiting_approval', 'api', `POST /payouts → 202, approval ${approval.approvalId} needs ${approval.requiredApprovals} approver(s)`);
    this.log.log('api', `payout for ${wd.id} held for approval ${approval.approvalId}`, { requestId });
  }

  /** 200: sent. `pending` on Avvio's side is `sent` on ours. */
  private sent(wd: Withdrawal, payout: Payout, replayed: boolean, requestId: string | null): void {
    wd.payoutId = payout.payoutId;
    // The response may already say processing or completed; fold it in as-is.
    const changed = applyPayout(wd, payout, 'api', undefined);
    if (changed) wd.timeline[wd.timeline.length - 1].note = `POST /payouts → 200${replayed ? ' (replayed, same payout)' : ''}`;
    this.log.log('api', `payout ${wd.payoutId} sent for ${wd.id} (${wd.reference})${replayed ? ', replayed' : ''}`, { requestId });
  }
}
