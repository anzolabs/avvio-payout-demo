// What the backend answers. Mirrors the API's view models, never Avvio's.

export interface Payee {
  id: string;
  name: string;
  email: string;
  available: string;
  note: string;
}

export interface ServerState {
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
  limits?: { min: string; max: string } | null;
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
  currency: string;
  registeredAt: string;
}

export type WithdrawalStatus =
  | 'creating' | 'awaiting_approval' | 'sent' | 'processing' | 'completed' | 'returned' | 'failed' | 'canceled' | 'error';

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
  reference: string;
  status: WithdrawalStatus;
  payoutId?: string;
  failureCode?: string | null;
  fundsReturned?: boolean;
  destinationAmount?: string;
  destinationCurrency?: string;
  fee?: string;
  error?: { type: string; message: string };
  timeline: TimelineEntry[];
  createdAt: string;
}

export interface LogLine {
  at: string;
  source: string;
  message: string;
  extra?: { requestId?: string | null };
}

export const FINAL: WithdrawalStatus[] = ['completed', 'returned', 'failed', 'canceled', 'error'];
export const isFinal = (s: WithdrawalStatus): boolean => FINAL.includes(s);
