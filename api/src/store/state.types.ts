/** A payee's saved bank account: ids and a last4, never the account number. */
export interface Account {
  methodId: string;
  destinationAccountId: string;
  last4: string | null;
  currency: string;
  registeredAt: string;
}

export type WithdrawalStatus =
  | 'creating'
  /** The send went out but its outcome is not known (timeout, 5xx, 429). The
   *  payout may exist. Resolved by looking it up by reference, then by
   *  re-sending with the SAME Idempotency-Key. Never by a new key. */
  | 'unknown'
  | 'awaiting_approval'
  | 'sent'
  | 'processing'
  | 'completed'
  | 'returned'
  | 'failed'
  | 'canceled'
  | 'error';

export interface TimelineEntry {
  at: string;
  source: 'app' | 'api' | 'webhook' | 'feed' | 'poll' | 'backend';
  status: WithdrawalStatus;
  note: string;
}

/** The business's own record of one payout to one payee. */
export interface Withdrawal {
  id: string;
  payeeId: string;
  payeeName: string;
  amount: string;
  currency: string;
  destinationAccountId: string;
  last4: string | null;
  reference: string;
  /** Persisted before the send; never leaves the backend. */
  idempotencyKey: string;
  /** The app's id for this tap, so a double tap or a retried request from the
   *  app returns this withdrawal instead of creating a second one. */
  requestId: string;
  /** What the payee was shown on the confirm screen; sent as expectDestination. */
  expectDestination?: string;
  /** Resend attempts while `unknown`, and when the next one is due. */
  attempts?: number;
  nextAttemptAt?: string;
  status: WithdrawalStatus;
  payoutId?: string;
  approvalId?: string;
  approvalExpiresAt?: string;
  failureCode?: string | null;
  fundsReturned?: boolean;
  destinationAmount?: string;
  destinationCurrency?: string;
  fee?: string;
  completedAt?: string;
  error?: { type: string; message: string; requestId?: string | null; errors?: string[] };
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface LogLine {
  at: string;
  source: string;
  message: string;
  extra?: Record<string, unknown>;
}

export interface State {
  accounts: Record<string, Account[]>;
  /** payeeId -> Avvio recipientId */
  recipients: Record<string, string>;
  withdrawals: Record<string, Withdrawal>;
  /** Event ids already applied, from webhooks or the feed. */
  seenEvents: string[];
  /** `nextSince` from the last feed page. */
  eventsCursor: string | null;
  log: LogLine[];
}

export const emptyState = (): State => ({
  accounts: {},
  recipients: {},
  withdrawals: {},
  seenEvents: [],
  eventsCursor: null,
  log: [],
});
