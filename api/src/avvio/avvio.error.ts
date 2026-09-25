import { ApiErrorBody } from './avvio.types';

/** A non-2xx answer from Avvio. `type` is what an integration branches on. */
export class AvvioError extends Error {
  readonly type: string;

  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
    readonly requestId: string | null,
    /** Seconds, from a 429's Retry-After header. Authoritative when present. */
    readonly retryAfter: number | null = null,
  ) {
    super(`${body?.type ?? `HTTP_${status}`}: ${body?.message ?? body?.detail ?? 'request failed'}`);
    this.name = 'AvvioError';
    this.type = body?.type ?? `HTTP_${status}`;
  }

  get errors(): string[] {
    return this.body?.errors ?? [];
  }
}

/** Answers that mean "the payout may or may not exist": never mint a new key. */
const UNKNOWN_TYPES = new Set(['PAYOUT_OUTCOME_UNKNOWN', 'IDEMPOTENCY_KEY_REQUEST_IN_PROGRESS']);

/**
 * True when a money-moving call's outcome is unknown: a timeout or network
 * failure (not an AvvioError at all), any 5xx, a 408, a 429 (refused before it
 * ran, so safe to resend with the same key), or an explicit unknown-outcome type.
 */
export function isUnknownOutcome(e: unknown): boolean {
  if (!(e instanceof AvvioError)) return true;
  return e.status >= 500 || e.status === 408 || e.status === 429 || UNKNOWN_TYPES.has(e.type);
}
