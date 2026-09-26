import { WithdrawalStatus } from '../api/types';

// Withdrawal status → tone and the words the payee reads. Every pill carries a dot as well as a word.
const PILL: Record<WithdrawalStatus, [string, string]> = {
  creating: ['live', 'Sending'],
  unknown: ['live', 'Confirming'],
  awaiting_approval: ['warn', 'Awaiting approval'],
  sent: ['live', 'Sent'],
  processing: ['live', 'Processing'],
  completed: ['ok', 'Paid'],
  returned: ['warn', 'Returned'],
  failed: ['bad', 'Failed'],
  canceled: ['grey', 'Canceled'],
  error: ['bad', 'Not sent'],
};

export function StatusPill({ status }: { status: WithdrawalStatus }) {
  const [tone, text] = PILL[status] ?? ['grey', status];
  return <span className={'pill ' + tone}>{text}</span>;
}
