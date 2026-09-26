import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PayeesService } from '../src/payees/payees.service';
import { visitorOfId } from '../src/visitor';

// The hosted demo keeps visitors apart by the id suffix alone: these are the rules that must hold.
test('each visitor owns only their own copy of a payee; local mode is unchanged', () => {
  const payees = new PayeesService();
  const a = 'v0123456789', b = 'vabcdefabcd';
  const mine = payees.all(a)[0].id;
  assert.equal(mine, `payee_4471-${a}`);
  assert.equal(payees.byId(mine)?.name, 'Ana Lopez');
  assert.ok(payees.owns(mine, a));
  assert.ok(!payees.owns(mine, b), 'another visitor');
  assert.ok(!payees.owns(mine, ''), 'the local, visitor-less view');
  assert.ok(!payees.owns('payee_4471', a), 'a bare fixture id from a visitor');
  assert.ok(payees.owns('payee_4471', ''), 'local mode');
  assert.ok(!payees.owns(`payee_9999-${a}`, a), 'unknown payee');
});

test('log lines are attributed by the ids they name', () => {
  assert.equal(visitorOfId('POST /recipients → 201 for payee_4471-v0123456789'), 'v0123456789');
  assert.equal(visitorOfId('GET /orders/x → completed, wd_v0123456789_ab12cd34ef now completed'), 'v0123456789');
  assert.equal(visitorOfId('GET /orders/x → completed, wd_ab12cd34ef now completed'), '');
  assert.equal(visitorOfId('backfilled 12 event(s); cursor 2026-09-26'), '');
});

test('the console never shows a full account number', async () => {
  const { mask } = await import('../src/store/log.service');
  assert.deepEqual(mask({ method: { recipientDetails: { clabeNumber: '012180000000070003' } }, amount: '25.00' }), {
    method: { recipientDetails: { clabeNumber: '····0003' } },
    amount: '25.00',
  });
});

test('a family recipient gets a stable id of their own, still attributed to the visitor', async () => {
  const { slug } = await import('../src/payees/accounts.service');
  assert.equal(slug('Rosa López'), 'rosa-lopez');
  assert.equal(slug("  D'Angelo  Pérez-Soto "), 'd-angelo-perez-soto');
  assert.equal(visitorOfId(`payee_4471-v0123456789-${slug('Rosa López')}`), 'v0123456789');
});
