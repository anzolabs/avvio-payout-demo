// What the backend answers. Mirrors the API's view models, never Avvio's.

export interface Payee {
  id: string;
  name: string;
  email: string;
  available: string;
  /** What the backend will allow now: available minus what is on its way or paid. */
  left: string;
  note: string;
}

/** A sandbox test account: its last digits pick the payout's outcome. */
export interface SandboxAccount {
  suffix: string;
  outcome: string;
  details: Record<string, string>;
}

export interface ServerState {
  currencies: string[];
  sandboxAccounts: Record<string, SandboxAccount[]>;
  /** The hosted demo: shared sandbox, test accounts only, tops itself up. */
  publicDemo?: boolean;
  configured: boolean;
  mode: 'test' | 'live' | null;
  orgId: string;
  baseUrl: string;
  currency: string;
  webhookConfigured: boolean;
  policy: { mode: string; features: string[]; thresholdUsd: string | null; maxSinglePayoutUsd: string | null } | null;
  bootError: string | null;
  payees: Payee[];
}

export interface CorridorField {
  id: string;
  title: string;
  type: string;
  required: boolean;
  pattern?: string;
  checksum?: string;
  options?: { value: string; label?: string }[];
}

export interface Corridor {
  currency: string;
  fields: CorridorField[];
  limits?: { min?: string; max?: string } | null;
}

export interface Money {
  currency: string;
  amount: string;
}

export interface Quote {
  destinationAmount: Money;
  fee: Money;
  rate: string | number;
}

export interface Account {
  id: string;
  destinationAccountId: string;
  last4: string | null;
  bank: string | null;
  /** The name on the account: a family member. Null means the payee's own. */
  holder: string | null;
  currency: string;
  registeredAt: string;
}

export type WithdrawalStatus =
  | 'creating' | 'unknown' | 'awaiting_approval' | 'sent' | 'processing' | 'completed' | 'returned' | 'failed' | 'canceled' | 'error';

export interface TimelineEntry {
  at: string;
  source: string;
  status: WithdrawalStatus;
  note: string;
}

export interface Withdrawal {
  id: string;
  payeeId: string;
  payeeName: string;
  amount: string;
  last4: string | null;
  holder?: string | null;
  purposeOfPayment?: string;
  reference: string;
  status: WithdrawalStatus;
  payoutId?: string;
  failureCode?: string | null;
  fundsReturned?: boolean;
  /** Still unknown after many lookups: a person has to look. */
  needsSupport?: boolean;
  destinationAmount?: string;
  destinationCurrency?: string;
  fee?: string;
  error?: { type: string; message: string };
  timeline: TimelineEntry[];
  createdAt: string;
}

/** One request the backend made to Avvio. Account numbers arrive masked. */
export interface ApiCall {
  method: string;
  path: string;
  status: number;
  ms: number;
  requestId: string | null;
  idempotencyKey?: string;
  replayed?: boolean;
  req?: unknown;
  res?: unknown;
}

export interface LogLine {
  at: string;
  source: string;
  message: string;
  extra?: { requestId?: string | null };
  call?: ApiCall;
}

/** Nothing moves these any more. */
export const TERMINAL: WithdrawalStatus[] = ['returned', 'failed', 'canceled', 'error'];
export const isTerminal = (s: WithdrawalStatus): boolean => TERMINAL.includes(s);

/**
 * Done as far as the payee is concerned. `completed` is included, but it is not
 * terminal: a bank can still return the money, so the app keeps watching it.
 */
export const isSettled = (s: WithdrawalStatus): boolean => s === 'completed' || isTerminal(s);
