import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AvvioError } from '../src/avvio/avvio.error';
import { AccountsService } from '../src/payees/accounts.service';
import { PayeesService } from '../src/payees/payees.service';
import { EventsService } from '../src/withdrawals/events.service';
import { WithdrawalsService } from '../src/withdrawals/withdrawals.service';
import { testStore } from './helpers';

const ok = (payoutId: string, replayed = false) => ({
  status: 200, requestId: 'req', replayed,
  body: { payoutId, status: 'pending', destinationAmount: { currency: 'MXN', amount: '1269.66' }, fee: { currency: 'USD', amount: '0.38' } },
});

/** A fake Avvio that answers from a script and records every key it was sent. */
function setup(script: Array<() => unknown>, byReference: Array<unknown> = []) {
  const { config, repo, log } = testStore();
  const keys: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const avvio = {
    createPayout: async (body: Record<string, unknown>, key: string) => {
      keys.push(key);
      bodies.push(body);
      const next = script.shift();
      if (!next) throw new Error('unexpected call');
      return next();
    },
    payoutByReference: async () => byReference.shift() ?? null,
  };
  repo.state.accounts['payee_4471'] = [{ methodId: 'm1', destinationAccountId: 'acct_0003', last4: '0003', currency: 'MXN', registeredAt: '' }];
  const payees = new PayeesService();
  const accounts = new AccountsService(config, avvio as never, repo, log, payees);
  const svc = new WithdrawalsService(config, avvio as never, repo, log, payees, accounts);
  return { svc, repo, keys, bodies };
}

const REQ = '6f1c1f5a-0b7e-4b8e-9f63-2f0e8f6f2a11';
const due = (w: { nextAttemptAt?: string }) => { w.nextAttemptAt = undefined; };

test('a timeout is unknown, not an error; the resend uses the SAME key and pays once', async () => {
  const { svc, keys } = setup([
    () => { throw new TypeError('fetch failed'); },
    () => ok('p1', true),
  ]);
  const wd = await svc.create('payee_4471', '75.00', 'acct_0003', REQ, '1269.66');
  assert.equal(wd.status, 'unknown');
  due(wd);
  await svc.resolve(wd); // not found by reference -> resend
  assert.equal(wd.status, 'sent');
  assert.equal(wd.payoutId, 'p1');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], 'the resend must reuse the original Idempotency-Key');
});

test('5xx, 429 and PAYOUT_OUTCOME_UNKNOWN are unknown outcomes', async () => {
  for (const err of [
    new AvvioError(500, { type: 'PAYOUT_OUTCOME_UNKNOWN' }, 'r'),
    new AvvioError(503, { type: 'SERVICE_UNAVAILABLE' }, 'r'),
    new AvvioError(429, { type: 'RATE_LIMITED' }, 'r', 7),
    new AvvioError(409, { type: 'IDEMPOTENCY_KEY_REQUEST_IN_PROGRESS' }, 'r'),
  ]) {
    const { svc } = setup([() => { throw err; }]);
    const wd = await svc.create('payee_4471', '10.00', 'acct_0003', REQ);
    assert.equal(wd.status, 'unknown', err.type);
    if (err.status === 429) {
      const waited = (Date.parse(wd.nextAttemptAt!) - Date.now()) / 1000;
      assert.ok(waited > 6 && waited <= 7, 'Retry-After is honoured');
    }
  }
});

test('an unknown outcome found by reference is not resent', async () => {
  const { svc, keys } = setup(
    [() => { throw new AvvioError(502, { type: 'BAD_GATEWAY' }, 'r'); }],
    [{ payoutId: 'p7', status: 'processing' }],
  );
  const wd = await svc.create('payee_4471', '10.00', 'acct_0003', REQ);
  due(wd);
  await svc.resolve(wd);
  assert.equal(wd.status, 'processing');
  assert.equal(wd.payoutId, 'p7');
  assert.equal(keys.length, 1);
});

test('a 4xx is final: error, nothing resent', async () => {
  const { svc, keys } = setup([() => { throw new AvvioError(400, { type: 'RATE_DRIFT_EXCEEDED' }, 'r'); }]);
  const wd = await svc.create('payee_4471', '10.00', 'acct_0003', REQ, '170.00');
  assert.equal(wd.status, 'error');
  assert.equal(wd.error?.type, 'RATE_DRIFT_EXCEEDED');
  assert.equal(keys.length, 1);
});

test('the same requestId twice (a double tap) returns the same withdrawal and sends once', async () => {
  const { svc, keys } = setup([() => ok('p1')]);
  const a = await svc.create('payee_4471', '10.00', 'acct_0003', REQ);
  const b = await svc.create('payee_4471', '10.00', 'acct_0003', REQ);
  assert.equal(a.id, b.id);
  assert.equal(keys.length, 1);
  await assert.rejects(svc.create('payee_4471', '11.00', 'acct_0003', REQ), /different withdrawal/);
});

test('expectDestination is sent; more than the payee has available is refused before any call', async () => {
  const { svc, bodies, keys } = setup([() => ok('p1')]);
  await svc.create('payee_4471', '75.00', 'acct_0003', REQ, '1269.66');
  assert.equal(bodies[0].expectDestination, '1269.66');
  await assert.rejects(svc.create('payee_4471', '312.51', 'acct_0003', '0b8c6a52-9f1e-4d2b-8c47-5d0e6f7a8b90'), /more than/);
  assert.equal(keys.length, 1);
});

test('feed rows with data: null are matched by their top-level payoutId', () => {
  const { repo, log } = testStore();
  const events = new EventsService(repo, log);
  repo.state.withdrawals.wd_1 = {
    id: 'wd_1', requestId: 'r', payeeId: 'payee_4471', payeeName: 'Ana', amount: '75.00', sourceCurrency: 'USD', destinationAccountId: 'a',
    last4: '0003', reference: 'DEMO-1', idempotencyKey: 'k', status: 'completed', payoutId: 'sbx_pay_1', timeline: [], createdAt: '', updatedAt: '',
  };
  assert.doesNotThrow(() => events.apply({ id: 'e1', sequence: '1', type: 'payout.returned', payoutId: 'sbx_pay_1', status: 'failed', data: null }, 'feed'));
  assert.equal(repo.state.withdrawals.wd_1.status, 'returned');
  assert.doesNotThrow(() => events.apply({ id: 'e2', sequence: '2', type: 'payout.pending', data: null }, 'feed'));
  assert.doesNotThrow(() => events.apply({ id: 'e3', sequence: '3', type: 'payout_approval.executed', data: null }, 'feed'));
});

const REQ2 = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const REQ3 = '2c8e7ade-ccfe-4c3e-8c6e-bc9efccea5fe';

test('what a payee has available counts withdrawals already made; a failure gives it back', async () => {
  const { svc } = setup([() => ok('p1'), () => { throw new AvvioError(400, { type: 'VALIDATION_ERROR' }, 'r'); }, () => ok('p3')]);
  // Ana has 312.50.
  await svc.create('payee_4471', '300.00', 'acct_0003', REQ);
  await assert.rejects(svc.create('payee_4471', '12.51', 'acct_0003', REQ2), /left to withdraw \(\$12\.50\)/);
  // A withdrawal that ends in error returns what it held.
  const { svc: svc2 } = setup([() => { throw new AvvioError(400, { type: 'VALIDATION_ERROR' }, 'r'); }, () => ok('p2')]);
  await svc2.create('payee_4471', '312.50', 'acct_0003', REQ);
  const again = await svc2.create('payee_4471', '312.50', 'acct_0003', REQ3);
  assert.equal(again.status, 'sent');
});

test('two taps at the same instant with one requestId send once', async () => {
  const { svc, keys } = setup([() => ok('p1'), () => ok('p2')]);
  const [a, b] = await Promise.all([
    svc.create('payee_4471', '10.00', 'acct_0003', REQ),
    svc.create('payee_4471', '10.00', 'acct_0003', REQ),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(keys.length, 1);
});

test('PAYOUT_OUTCOME_UNKNOWN burns the key: never resent, only looked up, then handed to a person', async () => {
  const { svc, keys } = setup([() => { throw new AvvioError(500, { type: 'PAYOUT_OUTCOME_UNKNOWN' }, 'r'); }]);
  const wd = await svc.create('payee_4471', '10.00', 'acct_0003', REQ);
  assert.equal(wd.status, 'unknown');
  assert.equal(wd.keyBurned, true);
  for (let i = 0; i < 20; i++) {
    due(wd);
    await svc.resolve(wd); // lookup finds nothing each time
  }
  assert.equal(keys.length, 1, 'no resend after the API said it does not know');
  assert.equal(wd.needsSupport, true);
});

test('a first backfill is quiet about events that are not ours, but still applies ours', () => {
  const { repo, log } = testStore();
  const events = new EventsService(repo, log);
  repo.state.withdrawals.wd_1 = {
    id: 'wd_1', requestId: 'r', payeeId: 'payee_4471', payeeName: 'Ana', amount: '75.00', sourceCurrency: 'USD', destinationAccountId: 'a',
    last4: '0003', reference: 'DEMO-1', idempotencyKey: 'k', status: 'completed', payoutId: 'sbx_pay_1', timeline: [], createdAt: '', updatedAt: '',
  };
  const before = repo.state.log.length;
  events.apply({ id: 'e1', sequence: '1', type: 'payout.completed', payoutId: 'someone_else', status: 'completed', data: null }, 'feed', true);
  assert.equal(repo.state.log.length, before, 'nothing logged for a payout that is not ours');
  events.apply({ id: 'e2', sequence: '2', type: 'payout.returned', payoutId: 'sbx_pay_1', status: 'failed', data: null }, 'feed', true);
  assert.equal(repo.state.withdrawals.wd_1.status, 'returned');
});
