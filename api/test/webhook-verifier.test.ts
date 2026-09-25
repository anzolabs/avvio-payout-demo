import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { WebhookVerifier } from '../src/avvio/webhook-verifier';

const key = randomBytes(24);
const secret = 'whsec_' + key.toString('base64');
const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payout.completed', data: {} }));
const sign = (k: Buffer, id: string, ts: string, b: Buffer) => 'v1,' + createHmac('sha256', k).update(`${id}.${ts}.`).update(b).digest('base64');
const now = () => String(Math.floor(Date.now() / 1000));
const headers = (sig: string, ts = now(), id = 'evt_1') => ({ 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig });
const v = new WebhookVerifier();

test('a correct signature verifies and returns the parsed event', () => {
  const ts = now();
  const out = v.verify<{ type: string }>({ rawBody: body, headers: headers(sign(key, 'evt_1', ts, body), ts), secret });
  assert.equal(out.id, 'evt_1');
  assert.equal(out.event.type, 'payout.completed');
});

test('two signatures after a rotation: either one is enough', () => {
  const ts = now();
  const old = randomBytes(24);
  const sig = `${sign(old, 'evt_1', ts, body)} ${sign(key, 'evt_1', ts, body)}`;
  assert.doesNotThrow(() => v.verify({ rawBody: body, headers: headers(sig, ts), secret }));
});

test('rejects a changed body, a wrong secret, a stale timestamp, a missing header, a non-v1 entry', () => {
  const ts = now();
  const good = sign(key, 'evt_1', ts, body);
  const tampered = Buffer.from(body.toString().replace('completed', 'failed'));
  assert.throws(() => v.verify({ rawBody: tampered, headers: headers(good, ts), secret }), /signature mismatch/);
  assert.throws(() => v.verify({ rawBody: body, headers: headers(good, ts), secret: 'whsec_' + randomBytes(24).toString('base64') }), /signature mismatch/);
  const stale = String(Math.floor(Date.now() / 1000) - 301);
  assert.throws(() => v.verify({ rawBody: body, headers: headers(sign(key, 'evt_1', stale, body), stale), secret }), /tolerance/);
  assert.throws(() => v.verify({ rawBody: body, headers: { 'svix-id': 'evt_1', 'svix-timestamp': ts }, secret }), /missing/);
  assert.throws(() => v.verify({ rawBody: body, headers: headers(good.replace('v1,', 'v2,'), ts), secret }), /signature mismatch/);
});
