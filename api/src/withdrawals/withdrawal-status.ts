import { Approval, Payout, WebhookPayout } from '../avvio/avvio.types';
import { TimelineEntry, Withdrawal, WithdrawalStatus } from '../store/state.types';

/**
 * The status machine, as pure functions. Statuses move forward only: a poll
 * answered after a webhook, or a webhook delivered out of order, must never
 * move a withdrawal backwards.
 */
const RANK: Record<WithdrawalStatus, number> = {
  creating: 0, error: 0, awaiting_approval: 1, sent: 2,
  processing: 3, completed: 4, returned: 5, failed: 5, canceled: 5,
};

/** Statuses the pollers still care about. */
export const OPEN_STATUSES: WithdrawalStatus[] = ['awaiting_approval', 'sent', 'processing'];

export const isFinal = (s: WithdrawalStatus): boolean => RANK[s] >= 4 || s === 'error';

/** Map a payout (from a poll, a webhook or the feed) to a withdrawal status. */
export function statusFromPayout(p: Pick<Payout, 'status' | 'failureCode'>, eventType?: string): WithdrawalStatus | null {
  if (eventType === 'payout.returned') return 'returned';
  switch (p.status) {
    case 'pending': return 'sent';
    case 'processing': return 'processing';
    case 'completed': return 'completed';
    case 'failed': return p.failureCode === 'returned_by_bank' ? 'returned' : 'failed';
    case 'canceled': return 'canceled';
    default: return null;
  }
}

/** Move to `next` if that is forward. Returns true when the status changed. */
export function transition(wd: Withdrawal, next: WithdrawalStatus, source: TimelineEntry['source'], note: string): boolean {
  if (RANK[next] < RANK[wd.status] || next === wd.status) return false;
  wd.status = next;
  wd.updatedAt = new Date().toISOString();
  wd.timeline.push({ at: wd.updatedAt, source, status: next, note });
  return true;
}

/** Fold a payout, in either the REST or the webhook shape, into a withdrawal. */
export function applyPayout(wd: Withdrawal, p: Payout | WebhookPayout, source: TimelineEntry['source'], eventType?: string): boolean {
  const next = statusFromPayout(p, eventType);
  if (!next) return false;
  wd.payoutId = p.payoutId || wd.payoutId;
  wd.failureCode = p.failureCode ?? wd.failureCode ?? null;
  if (typeof p.fundsReturned === 'boolean') wd.fundsReturned = p.fundsReturned;
  const dest = p.destinationAmount;
  if (dest && typeof dest === 'object') {
    wd.destinationAmount = dest.amount;
    wd.destinationCurrency = dest.currency;
  } else if (typeof dest === 'string') {
    wd.destinationAmount = dest;
    wd.destinationCurrency = (p as WebhookPayout).destinationCurrency ?? wd.destinationCurrency;
  }
  const fee = (p as Payout).fee;
  if (fee && typeof fee === 'object') wd.fee = fee.amount;
  if (p.completedAt) wd.completedAt = p.completedAt;
  return transition(wd, next, source, eventType ?? `payout ${p.status}`);
}

/** Fold an approval (after a 202) into a withdrawal. */
export function applyApproval(wd: Withdrawal, approval: Approval, source: TimelineEntry['source']): boolean {
  switch (approval.status) {
    case 'executed':
      wd.payoutId = approval.payoutId ?? wd.payoutId;
      return transition(wd, 'sent', source, 'approval executed');
    case 'rejected':
    case 'expired':
      wd.failureCode = `approval_${approval.status}`;
      return transition(wd, 'failed', source, `approval ${approval.status}`);
    case 'execution_failed':
      wd.failureCode = 'execution_failed';
      return transition(wd, 'failed', source, 'approval execution failed');
    default:
      return false; // pending, approved, executing: still waiting
  }
}

/** What the app is allowed to see. The idempotency key stays on the backend. */
export function toView(wd: Withdrawal): Omit<Withdrawal, 'idempotencyKey'> {
  const { idempotencyKey: _omitted, ...rest } = wd;
  return rest;
}
