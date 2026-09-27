/**
 * Sandbox test accounts, per currency. The Avvio sandbox decides what happens
 * to every payout from the LAST FOUR DIGITS of the account it is sent to, in
 * any currency: 0003 is paid then returned by the bank, 0002 is slow, 0001
 * fails, anything else completes normally. The app offers these in its tray,
 * and the hosted demo accepts nothing else, so no one types real bank details.
 * Each set is valid for its corridor (the IBANs carry real check digits).
 */
export interface SandboxAccount {
  /** The last four digits that pick the outcome. */
  suffix: string;
  outcome: string;
  /** Keyed by the corridor's field ids. */
  details: Record<string, string>;
}

const OUTCOMES: [string, string][] = [
  ['5669', 'completes normally'],
  ['0003', 'completes, then the bank returns it'],
  ['0002', 'slow: shows processing, completes at 60 s'],
  ['0001', 'fails, account invalid'],
];

// Per currency and outcome suffix: the details to register, keyed by field id.
const DETAILS: Record<string, Record<string, Record<string, string>>> = {
  MXN: {
    '5669': { clabeNumber: '012180000000045669' },
    '0003': { clabeNumber: '012180000000070003' },
    '0002': { clabeNumber: '012180000000000002' },
    '0001': { clabeNumber: '012180000000030001' },
  },
  INR: {
    '5669': { accountNumber: '50100000005669', ifscCode: 'HDFC0001234' },
    '0003': { accountNumber: '50100000000003', ifscCode: 'HDFC0001234' },
    '0002': { accountNumber: '50100000000002', ifscCode: 'HDFC0001234' },
    '0001': { accountNumber: '50100000000001', ifscCode: 'HDFC0001234' },
  },
  PHP: {
    '5669': { accountNumber: '100000005669' },
    '0003': { accountNumber: '100000000003' },
    '0002': { accountNumber: '100000000002' },
    '0001': { accountNumber: '100000000001' },
  },
  EUR: {
    '5669': { iban: 'DE97370400440532015669' },
    '0003': { iban: 'DE13370400440532010003' },
    '0002': { iban: 'DE40370400440532010002' },
    '0001': { iban: 'DE67370400440532010001' },
  },
  GBP: {
    '5669': { accountNumber: '12345669' },
    '0003': { accountNumber: '12340003' },
    '0002': { accountNumber: '12340002' },
    '0001': { accountNumber: '12340001' },
  },
};

export const SANDBOX_ACCOUNTS: Record<string, SandboxAccount[]> = Object.fromEntries(
  Object.entries(DETAILS).map(([ccy, bySuffix]) => [ccy, OUTCOMES.map(([suffix, outcome]) => ({ suffix, outcome, details: bySuffix[suffix] }))]),
);

/**
 * Whether these details are exactly one of the test accounts for this
 * currency: the same fields, no more, so nothing real can ride along in an
 * extra field. Spaces and letter case are forgiven.
 */
export function isSandboxAccount(currency: string, details: Record<string, string>): boolean {
  const keys = Object.keys(details).sort().join();
  return (SANDBOX_ACCOUNTS[currency] ?? []).some((a) =>
    Object.keys(a.details).sort().join() === keys &&
    Object.entries(a.details).every(([k, v]) => (details[k] ?? '').replace(/\s/g, '').toUpperCase() === v.toUpperCase()),
  );
}
