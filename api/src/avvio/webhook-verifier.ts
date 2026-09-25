import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedDelivery<T = unknown> {
  id: string;
  event: T;
}

/**
 * Standard Webhooks verification, written out so the recipe is visible. Any
 * Svix-compatible library does the same thing.
 */
@Injectable()
export class WebhookVerifier {
  verify<T = unknown>(args: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; secret: string; toleranceSec?: number }): VerifiedDelivery<T> {
    const { rawBody, headers, secret, toleranceSec = 300 } = args;
    const id = header(headers, 'svix-id');
    const ts = header(headers, 'svix-timestamp');
    const sig = header(headers, 'svix-signature');
    if (!id || !ts || !sig) throw new Error('missing svix-id, svix-timestamp or svix-signature');

    // 1. Freshness: outside five minutes is a replay or a broken clock.
    const now = Math.floor(Date.now() / 1000);
    if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > toleranceSec) throw new Error('svix-timestamp outside tolerance');

    // 2. The signed content is `${id}.${timestamp}.${raw body}`, HMAC-SHA256
    //    with the base64-decoded secret (the part after `whsec_`).
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', key).update(`${id}.${ts}.`).update(rawBody).digest();

    // 3. `svix-signature` is a space-separated list of `v1,<base64>`. Two entries
    //    are present for 24 hours after a secret rotation; any match is enough.
    const ok = sig.split(' ').some((part) => {
      const [version, b64] = part.split(',');
      if (version !== 'v1' || !b64) return false;
      const got = Buffer.from(b64, 'base64');
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
    if (!ok) throw new Error('signature mismatch');

    return { id, event: JSON.parse(rawBody.toString('utf8')) as T };
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}
