import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSandboxAccount, SANDBOX_ACCOUNTS } from '../src/sandbox-accounts';

// The Avvio sandbox reads the outcome from the last four digits of the first
// detail value that has four or more digits. Mirror that, so a test account can
// never trigger an outcome other than the one its label promises.
const sandboxSuffix = (details: Record<string, string>) =>
  (Object.values(details).find((v) => /\d{4,}/.test(v)) ?? '').replace(/\D/g, '').slice(-4);

// Field rules as the sandbox corridors publish them (GET /recipients/{orgId}/corridors).
const PATTERNS: Record<string, Record<string, RegExp>> = {
  MXN: { clabeNumber: /^[0-9]{18}$/ },
  INR: { accountNumber: /^[0-9]{9,18}$/, ifscCode: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
  PHP: { accountNumber: /^[0-9]{6,18}$/ },
  EUR: { iban: /^[A-Z]{2}[0-9A-Z]{13,32}$/ },
  GBP: { accountNumber: /^[0-9]{8}$/ },
};
const ibanOk = (i: string) => BigInt([...(i.slice(4) + i.slice(0, 4))].map((c) => parseInt(c, 36)).join('')) % 97n === 1n;

test('every test account is valid for its corridor and triggers the outcome it is labelled with', () => {
  for (const [ccy, accounts] of Object.entries(SANDBOX_ACCOUNTS)) {
    assert.deepEqual(accounts.map((a) => a.suffix), ['5669', '0003', '0002', '0001'], ccy);
    for (const a of accounts) {
      assert.equal(sandboxSuffix(a.details), a.suffix, `${ccy} ${a.suffix}`);
      for (const [field, re] of Object.entries(PATTERNS[ccy])) assert.match(a.details[field], re, `${ccy} ${field}`);
      if (a.details.iban) assert.ok(ibanOk(a.details.iban), `${a.details.iban} check digits`);
    }
  }
});

test('the public demo accepts only the listed test accounts', () => {
  assert.ok(isSandboxAccount('MXN', { clabeNumber: '012180000000070003' }));
  assert.ok(isSandboxAccount('EUR', { iban: 'de13 3704 0044 0532 0100 03' }), 'spaces and case are forgiven');
  assert.ok(!isSandboxAccount('MXN', { clabeNumber: '002010077777777771' }), 'a real-looking CLABE');
  assert.ok(!isSandboxAccount('INR', { accountNumber: '50100000000003', ifscCode: 'SBIN0000001' }), 'a real IFSC with a test number');
  assert.ok(isSandboxAccount('GBP', { accountNumber: '12340003', sortCode: '000000' }), 'extra fields do not matter');
  assert.ok(!isSandboxAccount('XXX', { accountNumber: '12340003' }), 'unknown currency');
});
