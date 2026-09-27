// How each destination currency is shown in the app. Fields and limits come
// from the corridor; this is only the label, the flag and a sample name.
export const CURRENCY_INFO: Record<string, { flag: string; country: string; sampleName: string }> = {
  MXN: { flag: '🇲🇽', country: 'Mexico', sampleName: 'Rosa López' },
  INR: { flag: '🇮🇳', country: 'India', sampleName: 'Priya Sharma' },
  PHP: { flag: '🇵🇭', country: 'the Philippines', sampleName: 'Maria Santos' },
  EUR: { flag: '🇪🇺', country: 'Europe (SEPA)', sampleName: 'Sofia Rossi' },
  GBP: { flag: '🇬🇧', country: 'the UK', sampleName: 'James Wilson' },
};

export const flagOf = (currency: string): string => CURRENCY_INFO[currency]?.flag ?? '🏦';

// The API's reasons for a payout (purposeOfPayment). Some corridors require one.
export const PURPOSES: [string, string][] = [
  ['FAMILY_SUPPORT', 'Family support'], ['GIFT', 'Gift'], ['EDUCATION', 'Education'], ['HEALTH_OR_MEDICAL', 'Health or medical'],
  ['UTILITY_BILL', 'Utility bill'], ['LOAN_PAYMENT', 'Loan payment'], ['GOODS_OR_SERVICES', 'Goods or services'], ['SALARY_PAYMENT', 'Salary'],
  ['REAL_ESTATE_PURCHASE', 'Real estate'], ['TAX_PAYMENT', 'Tax'], ['DONATION', 'Donation'], ['TRAVEL', 'Travel'], ['SELF', 'To my own account'], ['OTHER', 'Other'],
];
export const purposeLabel = (code?: string): string => PURPOSES.find(([c]) => c === code)?.[1] ?? code ?? '';
