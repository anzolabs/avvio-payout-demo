import { WithdrawalStatus } from '../api/types';

// Withdrawal status → badge colour and the words the payee reads.
const PILL: Record<WithdrawalStatus, [string, string]> = {
  creating: ['blue', 'Sending'],
  unknown: ['blue', 'Confirming'],
  awaiting_approval: ['amber', 'Waiting for approval'],
  sent: ['blue', 'Sent'],
  processing: ['blue', 'Processing'],
  completed: ['green', 'Paid'],
  returned: ['amber', 'Returned by bank'],
  failed: ['red', 'Failed'],
  canceled: ['grey', 'Canceled'],
  error: ['red', 'Could not send'],
};

export function StatusPill({ status }: { status: WithdrawalStatus }) {
  const [colour, text] = PILL[status] ?? ['grey', status];
  return <span className={'pill ' + colour}>{text}</span>;
}
