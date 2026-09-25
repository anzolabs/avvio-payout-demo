import { Approval, Payout, WebhookPayout } from '../avvio/avvio.types';
import { TimelineEntry, Withdrawal, WithdrawalStatus } from '../store/state.types';

/**
 * The status machine, as pure functions. Statuses move forward only: a poll
 * answered after a webhook, or a webhook delivered out of order, must never
 * move a withdrawal backwards. Two rules on top of the order:
 *
 * - `completed` is not final. A bank can return the money days later
 *   (`returned`), and a payout can be clawed back after settlement (`failed`,
 *   for example `compliance_rejected`, with the money NOT necessarily back).
 * - `returned`, `failed`, `canceled` and `error` are final. Nothing moves their
 *   status, but a later event may still fill in `fundsReturned`.
 * - `canceled` only happens before dispatch: never from `processing` on.
 */
const RANK: Record<WithdrawalStatus, number> = {
  creating: 0, unknown: 0, awaiting_approval: 1, sent: 2,
  processing: 3, completed: 4, returned: 5, failed: 5, canceled: 5, error: 5,
};

const TERMINAL: WithdrawalStatus[] = ['returned', 'failed', 'canceled', 'error'];

/** Statuses the pollers still care about. `completed` is watched by webhooks and the feed. */
export const OPEN_STATUSES: WithdrawalStatus[] = ['creating', 'unknown', 'awaiting_approval', 'sent', 'processing'];

export const isTerminal = (s: WithdrawalStatus): boolean => TERMINAL.includes(s);

export function canMove(from: WithdrawalStatus, to: WithdrawalStatus): boolean {
  if (from === to || isTerminal(from)) return false;
  if (from === 'completed') return to === 'returned' || to === 'failed';
  if (to === 'canceled') return RANK[from] < RANK.processing;
  // Only a send (or an approval's execution) can end in "we do not know yet".
  if (to === 'unknown') return from === 'creating' || from === 'awaiting_approval';
  return RANK[to] > RANK[from];
}

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

/** Move to `next` if the machine allows it. Returns true when the status changed. */
export function transition(wd: Withdrawal, next: WithdrawalStatus, source: TimelineEntry['source'], note: string): boolean {
  if (!canMove(wd.status, next)) return false;
  wd.status = next;
  wd.updatedAt = new Date().toISOString();
  wd.timeline.push({ at: wd.updatedAt, source, status: next, note });
  return true;
}

/** Fold a payout, in either the REST or the webhook shape, into a withdrawal. */
export function applyPayout(wd: Withdrawal, p: Payout | WebhookPayout, source: TimelineEntry['source'], eventType?: string): boolean {
  const next = statusFromPayout(p, eventType);
  if (!next) return false;
  if (!canMove(wd.status, next)) {
    // Same final status, later facts: the rail's refund step arrives as a
    // second failed event carrying fundsReturned. Record it; never move status.
    if (next === wd.status && isTerminal(wd.status)) return fillFacts(wd, p);
    return false;
  }

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

/** Copy failureCode / fundsReturned onto a final withdrawal. True if anything changed. */
function fillFacts(wd: Withdrawal, p: Pick<Payout, 'failureCode' | 'fundsReturned'>): boolean {
  let changed = false;
  if (p.failureCode && p.failureCode !== wd.failureCode) {
    wd.failureCode = p.failureCode;
    changed = true;
  }
  if (typeof p.fundsReturned === 'boolean' && p.fundsReturned !== wd.fundsReturned) {
    wd.fundsReturned = p.fundsReturned;
    changed = true;
  }
  if (changed) wd.updatedAt = new Date().toISOString();
  return changed;
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
    case 'execution_unknown':
      // The approval ran but did not record a payout. Look for one by our
      // reference; never re-send (that would ask for a second approval).
      return transition(wd, 'unknown', source, 'approval execution unknown; looking up by reference');
    default:
      return false; // pending, approved, executing: still waiting
  }
}

/** What the app is allowed to see. The idempotency key stays on the backend. */
export function toView(wd: Withdrawal): Omit<Withdrawal, 'idempotencyKey'> {
  const { idempotencyKey: _omitted, ...rest } = wd;
  return rest;
}
