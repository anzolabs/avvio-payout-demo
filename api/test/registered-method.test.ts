import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registeredMethod } from '../src/payees/accounts.service';

const m = (id: string, last4: string) => ({ id, kind: 'fiat' as const, currency: 'MXN', last4, destinationAccountId: `sbx_acct_MXN_${last4}_${id}` });
const clabe = (tail: string) => ({ clabeNumber: `01218000000007${tail}` });

// The live-sandbox case that paid the wrong account: a payee with four methods
// registers ...0003 again, the server matches the existing one, and the last
// method in the list is a 5669 account.
const ana = { id: 'r1', name: 'Ana', paymentMethods: [m('a', '5669'), m('b', '0003'), m('c', '5669')] };

test('a repeat of an existing account resolves to that account, not the last in the list', () => {
  const got = registeredMethod(ana, new Set(['a', 'b', 'c']), clabe('0003'));
  assert.equal(got?.id, 'b');
});

test('exactly one new method is the one this call added', () => {
  const after = { ...ana, paymentMethods: [...ana.paymentMethods, m('d', '4444')] };
  assert.equal(registeredMethod(after, new Set(['a', 'b', 'c']), clabe('4444'))?.id, 'd');
});

test('the server naming the method wins', () => {
  assert.equal(registeredMethod({ ...ana, method: m('c', '5669') }, new Set(['a', 'b', 'c']), clabe('0003'))?.id, 'c');
});

test('ambiguous cases refuse instead of guessing', () => {
  const twoSameTail = { ...ana, paymentMethods: [m('a', '0003'), m('b', '0003')] };
  assert.equal(registeredMethod(twoSameTail, new Set(['a', 'b']), clabe('0003')), undefined);
  const twoNew = { ...ana, paymentMethods: [m('a', '1111'), m('b', '2222')] };
  assert.equal(registeredMethod(twoNew, new Set(), clabe('1111')), undefined);
  assert.equal(registeredMethod(ana, new Set(['a', 'b', 'c']), clabe('9999')), undefined);
});

test('first registration of a new payee', () => {
  assert.equal(registeredMethod({ id: 'r', name: 'x', paymentMethods: [m('z', '0003')] }, new Set(), clabe('0003'))?.id, 'z');
});
