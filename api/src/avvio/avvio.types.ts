/** The slice of the Avvio API this integration uses. Amounts are decimal strings. */

export interface Money {
  currency: string;
  amount: string;
}

export interface Policy {
  organizationId: string;
  mode: 'test' | 'live';
  features: string[];
  limits: { maxSinglePayoutUsd: string | null; maxDailyPayoutUsd: string | null; maxDailyPerEndUserUsd: string | null };
  approvals: { thresholdUsd: string | null; requiredApprovals: number | null; appliesTo: string[] };
}

export interface CorridorField {
  id: string;
  title: string;
  type: string;
  required: boolean;
  pattern?: string;
  checksum?: string;
  description?: string;
  options?: { value: string; label?: string }[];
}

export interface Corridor {
  currency: string;
  fields: CorridorField[];
  /** Either bound may be absent: not every corridor publishes both. */
  limits?: { min?: string; max?: string } | null;
}

export interface CorridorsResponse {
  corridors: Corridor[];
  capabilities: { exactOutput: boolean; indicativePricing: boolean };
}

export interface IndicativeQuote {
  indicative: true;
  sourceAmount: Money;
  destinationAmount: Money;
  fee: Money;
  totalDebit: Money;
  rate: string | number;
}

export interface PaymentMethod {
  id: string;
  kind: 'fiat' | 'crypto';
  currency: string;
  last4?: string;
  status?: string;
  destinationAccountId?: string;
}

export interface Beneficiary {
  id: string;
  externalId?: string;
  name: string;
  email?: string;
  paymentMethods: PaymentMethod[];
  /** On a registration response: the method this call created or matched. */
  method?: PaymentMethod;
}

export interface CreateBeneficiaryBody {
  type: 'individual' | 'business';
  name: string;
  email: string;
  externalId: string;
  method: PaymentMethodInput;
}

export interface PaymentMethodInput {
  kind: 'fiat';
  currency: string;
  recipientDetails: Record<string, string>;
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';

export interface Payout {
  payoutId: string;
  status: PayoutStatus;
  failureCode?: string | null;
  fundsReturned?: boolean;
  sourceAmount?: Money;
  destinationAmount?: Money;
  destinationAccountId?: string | null;
  fee?: Money | null;
  rate?: string;
  reference?: string;
  createdAt?: string;
  completedAt?: string | null;
}

export interface CreatePayoutBody {
  amount: string;
  destinationAccountId: string;
  reference?: string;
  expectDestination?: string;
  maxDriftBps?: number;
  endUser?: { id: string; name?: string; email?: string };
}

export interface PendingApproval {
  status: 'pending_approval';
  approvalId: string;
  requiredApprovals: number;
  expiresAt: string;
}

export type ApprovalStatus =
  | 'pending' | 'approved' | 'rejected' | 'expired' | 'executing' | 'executed' | 'execution_failed' | 'execution_unknown';

export interface Approval {
  id: string;
  status: ApprovalStatus;
  payoutId?: string | null;
}

/** `data` of a payout.* event and of a webhook delivery: flat strings, not Money. */
export interface WebhookPayout {
  payoutId: string;
  status: PayoutStatus;
  failureCode?: string | null;
  fundsReturned?: boolean;
  reference?: string | null;
  destinationCurrency?: string | null;
  destinationAmount?: string | null;
  completedAt?: string | null;
}

export interface ApprovalEventData {
  approval: Approval;
  payoutId?: string | null;
}

export interface PayoutEvent {
  id: string;
  sequence: string;
  type: string;
  livemode?: boolean;
  /** Feed rows also carry these at the top level. */
  payoutId?: string | null;
  status?: PayoutStatus | null;
  /** Can be null on older feed rows: fall back to the top-level fields. */
  data: WebhookPayout | ApprovalEventData | Record<string, unknown> | null;
}

export interface EventsPage {
  data: PayoutEvent[];
  hasMore: boolean;
  nextSince: string | null;
}

export interface Balance {
  currency: string;
  amount: string;
}

/** The API's one error shape. Branch on `type`, never on the message. */
export interface ApiErrorBody {
  type?: string;
  message?: string;
  detail?: string;
  errors?: string[];
  requestId?: string;
  originalIdempotencyKey?: string;
}
