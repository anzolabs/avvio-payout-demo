import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WithdrawalStatus } from '../src/store/state.types';
import { applyApproval, applyPayout, canMove } from '../src/withdrawals/withdrawal-status';
import { withdrawal } from './helpers';

test('statuses only move forward', () => {
  const cases: [WithdrawalStatus, WithdrawalStatus, boolean][] = [
    ['sent', 'processing', true],
    ['processing', 'sent', false],
    ['sent', 'completed', true], // a skipped step is fine
    ['completed', 'returned', true],
    ['completed', 'failed', true], // a clawback after settlement
    ['processing', 'canceled', false],
    ['sent', 'canceled', true],
    ['completed', 'canceled', false],
    ['completed', 'processing', false],
    ['failed', 'returned', false],
    ['returned', 'failed', false],
    ['canceled', 'returned', false],
    ['error', 'sent', false],
    ['creating', 'unknown', true],
    ['awaiting_approval', 'unknown', true],
    ['sent', 'unknown', false],
    ['unknown', 'sent', true],
    ['unknown', 'awaiting_approval', true],
    ['unknown', 'error', true],
  ];
  for (const [from, to, want] of cases) assert.equal(canMove(from, to), want, `${from} -> ${to}`);
});

test('a bank return after completed: completed -> returned, never back', () => {
  const wd = withdrawal({ status: 'completed' });
  assert.equal(applyPayout(wd, { payoutId: 'p', status: 'failed', failureCode: 'returned_by_bank', fundsReturned: true }, 'webhook', 'payout.returned'), true);
  assert.equal(wd.status, 'returned');
  assert.equal(wd.fundsReturned, true);
  // A late poll answering "completed" does not undo it.
  assert.equal(applyPayout(wd, { payoutId: 'p', status: 'completed' }, 'poll'), false);
  assert.equal(wd.status, 'returned');
});

test('completed then failed without a return code is a clawback, not a return', () => {
  const wd = withdrawal({ status: 'completed' });
  applyPayout(wd, { payoutId: 'p', status: 'failed', failureCode: 'compliance_rejected' }, 'poll');
  assert.equal(wd.status, 'failed');
  assert.equal(wd.fundsReturned, undefined, 'never assumed back');
});

test('a later event fills fundsReturned on a final withdrawal without moving it', () => {
  const wd = withdrawal({ status: 'failed', failureCode: 'account_invalid' });
  assert.equal(applyPayout(wd, { payoutId: 'p', status: 'failed', failureCode: 'account_invalid', fundsReturned: true }, 'webhook', 'payout.failed'), true);
  assert.equal(wd.status, 'failed');
  assert.equal(wd.fundsReturned, true);
});

test('out of order: returned arrives before completed', () => {
  const wd = withdrawal({ status: 'sent' });
  applyPayout(wd, { payoutId: 'p', status: 'failed', failureCode: 'returned_by_bank' }, 'webhook', 'payout.returned');
  assert.equal(wd.status, 'returned');
  assert.equal(applyPayout(wd, { payoutId: 'p', status: 'completed' }, 'webhook', 'payout.completed'), false);
  assert.equal(wd.status, 'returned');
});

test('a failed payout stays failed', () => {
  const wd = withdrawal({ status: 'processing' });
  applyPayout(wd, { payoutId: 'p', status: 'failed', failureCode: 'account_invalid', fundsReturned: true }, 'poll');
  assert.equal(wd.status, 'failed');
  assert.equal(applyPayout(wd, { payoutId: 'p', status: 'canceled' }, 'poll'), false);
});

test('approvals', () => {
  const rejected = withdrawal({ status: 'awaiting_approval', approvalId: 'a' });
  applyApproval(rejected, { id: 'a', status: 'rejected' }, 'poll');
  assert.equal(rejected.status, 'failed');

  const executed = withdrawal({ status: 'awaiting_approval', approvalId: 'a' });
  applyApproval(executed, { id: 'a', status: 'executed', payoutId: 'p9' }, 'poll');
  assert.equal(executed.status, 'sent');
  assert.equal(executed.payoutId, 'p9');

  const unknown = withdrawal({ status: 'awaiting_approval', approvalId: 'a' });
  applyApproval(unknown, { id: 'a', status: 'execution_unknown' }, 'poll');
  assert.equal(unknown.status, 'unknown');
});
