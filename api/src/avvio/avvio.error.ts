import { ApiErrorBody } from './avvio.types';

/** A non-2xx answer from Avvio. `type` is what an integration branches on. */
export class AvvioError extends Error {
  readonly type: string;

  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
    readonly requestId: string | null,
  ) {
    super(`${body?.type ?? `HTTP_${status}`}: ${body?.message ?? body?.detail ?? 'request failed'}`);
    this.name = 'AvvioError';
    this.type = body?.type ?? `HTTP_${status}`;
  }

  get errors(): string[] {
    return this.body?.errors ?? [];
  }
}
