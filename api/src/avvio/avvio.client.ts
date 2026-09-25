import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { AvvioError } from './avvio.error';
import {
  Approval, Balance, Beneficiary, CorridorsResponse, CreateBeneficiaryBody, CreatePayoutBody,
  EventsPage, IndicativeQuote, PaymentMethodInput, Payout, PendingApproval, Policy,
} from './avvio.types';

const TIMEOUT_MS = 15_000;

export interface ApiResponse<T> {
  status: number;
  body: T;
  requestId: string | null;
  /** True when the server replayed a stored answer for this Idempotency-Key. */
  replayed: boolean;
}

/**
 * The partner's view of the Avvio API: a handful of calls, one header, one
 * error shape. This is the only class that talks to Avvio, and it runs on the
 * backend only; the key never leaves it.
 */
@Injectable()
export class AvvioClient {
  private readonly org: string;
  private readonly orgPath: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.org = encodeURIComponent(config.avvio.org);
    this.orgPath = `/payments/organizations/${this.org}`;
  }

  // ── organization ────────────────────────────────────────────────────────
  policy(): Promise<ApiResponse<Policy>> {
    return this.call('GET', `${this.orgPath}/policy`);
  }

  balance(): Promise<ApiResponse<Balance>> {
    return this.call('GET', `${this.orgPath}/balance`);
  }

  /** Sandbox only. Requires an Idempotency-Key. */
  fundSandbox(amount: string, idempotencyKey: string): Promise<ApiResponse<{ balance: string }>> {
    return this.call('POST', `${this.orgPath}/sandbox/fund`, { body: { amount }, idempotencyKey });
  }

  // ── the bank form ───────────────────────────────────────────────────────
  async corridors(currency?: string): Promise<CorridorsResponse> {
    const q = currency ? `?${new URLSearchParams({ currency })}` : '';
    return (await this.call<CorridorsResponse>('GET', `/recipients/${this.org}/corridors${q}`)).body;
  }

  /** Indicative price, no beneficiary needed. The binding price is on the payout. */
  async rates(amount: string, to: string): Promise<IndicativeQuote> {
    const q = new URLSearchParams({ from: 'USD', to, amount });
    return (await this.call<IndicativeQuote>('GET', `${this.orgPath}/rates?${q}`)).body;
  }

  // ── beneficiaries (payees) ──────────────────────────────────────────────
  createBeneficiary(body: CreateBeneficiaryBody, idempotencyKey: string): Promise<ApiResponse<Beneficiary>> {
    return this.call('POST', `/recipients/${this.org}`, { body, idempotencyKey });
  }

  async beneficiaryByExternalId(externalId: string): Promise<Beneficiary> {
    return (await this.call<Beneficiary>('GET', `/recipients/${this.org}/external/${encodeURIComponent(externalId)}`)).body;
  }

  /** Another account for an existing payee. Answers the whole beneficiary. */
  addMethod(recipientId: string, method: PaymentMethodInput, idempotencyKey: string): Promise<ApiResponse<Beneficiary>> {
    return this.call('POST', `/recipients/${this.org}/${encodeURIComponent(recipientId)}/methods`, { body: method, idempotencyKey });
  }

  deleteMethod(recipientId: string, methodId: string): Promise<ApiResponse<unknown>> {
    return this.call('DELETE', `/recipients/${this.org}/${encodeURIComponent(recipientId)}/methods/${encodeURIComponent(methodId)}`);
  }

  // ── payouts ─────────────────────────────────────────────────────────────
  /** Price and send in one call: 200 with the payout, or 202 pending_approval. */
  createPayout(body: CreatePayoutBody, idempotencyKey: string): Promise<ApiResponse<Payout | PendingApproval>> {
    return this.call('POST', `${this.orgPath}/payouts`, { body, idempotencyKey });
  }

  async payout(payoutId: string): Promise<Payout> {
    return (await this.call<Payout>('GET', `${this.orgPath}/orders/${encodeURIComponent(payoutId)}`)).body;
  }

  /** Recovery after an unknown outcome: the payout carrying OUR reference, if any. */
  async payoutByReference(reference: string): Promise<Payout | null> {
    const q = new URLSearchParams({ reference, limit: '1' });
    const { body } = await this.call<{ data: Payout[] }>('GET', `${this.orgPath}/orders?${q}`);
    return body.data?.[0] ?? null;
  }

  async approval(approvalId: string): Promise<Approval> {
    return (await this.call<Approval>('GET', `${this.orgPath}/payouts/approvals/${encodeURIComponent(approvalId)}`)).body;
  }

  // ── reconciliation ──────────────────────────────────────────────────────
  /** Every transition, oldest first. Carry `nextSince` between calls. */
  async events(since: string | null): Promise<EventsPage> {
    const q = new URLSearchParams({ limit: '500' });
    if (since) q.set('since', since);
    return (await this.call<EventsPage>('GET', `${this.orgPath}/events?${q}`)).body;
  }

  // ── transport ───────────────────────────────────────────────────────────
  private async call<T>(method: string, path: string, opts: { body?: unknown; idempotencyKey?: string } = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'x-api-key': this.config.avvio.key, accept: 'application/json' };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    // Persisted by the caller BEFORE this request is sent and reused on every
    // retry. That is the whole double-payment guard.
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    // A call that hangs is an unknown outcome, not a slow success: give up
    // after 15 s and let the caller resolve it with the same key.
    const res = await fetch(this.config.avvio.base + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    const requestId = res.headers.get('x-request-id') ?? (json as { requestId?: string } | null)?.requestId ?? null;
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new AvvioError(res.status, json as never, requestId, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
    }
    return { status: res.status, body: json as T, requestId, replayed: res.headers.get('idempotency-replayed') === 'true' };
  }
}
