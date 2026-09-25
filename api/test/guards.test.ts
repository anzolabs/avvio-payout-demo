import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsonOnly, localOnlyExceptWebhooks } from '../src/main';

type Req = { method: string; path: string; headers: Record<string, string | undefined> };
function run(mw: (req: never, res: never, next: () => void) => void, req: Req): number {
  let status = 0;
  const res = { status(c: number) { status = c; return this; }, json() { return this; } };
  mw(req as never, res as never, () => { status = 200; });
  return status;
}

test('the app and /api answer this machine only; a tunnel reaches webhooks only', () => {
  const local = { method: 'GET', path: '/api/state', headers: { host: 'localhost:4300' } };
  assert.equal(run(localOnlyExceptWebhooks, local), 200);
  assert.equal(run(localOnlyExceptWebhooks, { ...local, headers: { host: '[::1]:4300' } }), 200);
  assert.equal(run(localOnlyExceptWebhooks, { ...local, headers: { host: 'x.trycloudflare.com' } }), 403);
  assert.equal(run(localOnlyExceptWebhooks, { ...local, headers: { host: 'localhost', 'x-forwarded-for': '1.2.3.4' } }), 403);
  assert.equal(run(localOnlyExceptWebhooks, { ...local, path: '/API/state', headers: { host: 'x.trycloudflare.com' } }), 403);
  assert.equal(run(localOnlyExceptWebhooks, { method: 'POST', path: '/webhooks/avvio', headers: { host: 'x.trycloudflare.com' } }), 200);
});

test('every change is JSON only, whatever the case of the path', () => {
  const post = (path: string, type?: string) => run(jsonOnly, { method: 'POST', path, headers: { 'content-type': type } });
  assert.equal(post('/api/sandbox/fund', 'application/json'), 200);
  assert.equal(post('/api/sandbox/fund', 'application/json; charset=utf-8'), 200);
  assert.equal(post('/api/sandbox/fund', 'text/plain'), 415);
  assert.equal(post('/API/sandbox/fund', 'text/plain'), 415);
  assert.equal(post('/api/sandbox/fund', 'application/x-www-form-urlencoded'), 415);
  assert.equal(run(jsonOnly, { method: 'DELETE', path: '/api/payees/p/accounts/m', headers: {} }), 415);
  assert.equal(post('/webhooks/avvio', 'application/json'), 200);
  assert.equal(run(jsonOnly, { method: 'GET', path: '/api/state', headers: {} }), 200);
});
