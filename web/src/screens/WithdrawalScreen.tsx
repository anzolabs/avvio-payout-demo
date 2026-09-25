import { hhmmss, money } from '../api/client';
import { isSettled, Withdrawal } from '../api/types';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';

/** Failure codes in the payee's words. Unknown codes fall back to a generic line. */
const REASON: Record<string, string> = {
  account_invalid: 'the bank could not find that account',
  account_cannot_receive: 'that account cannot receive this payment',
  returned_by_bank: 'the bank sent it back',
  compliance_rejected: 'it did not pass a compliance check',
  insufficient_funds: 'there was not enough balance to send it',
  limit_exceeded: 'it was over a payout limit',
  quote_expired: 'the price expired before it was sent',
  execution_failed: 'the payment network could not send it',
};
const reason = (code?: string | null) => (code && REASON[code]) || 'the payment network could not complete it';

/** Refusals before anything was sent, in the payee's words. */
const REFUSAL: Record<string, string> = {
  RATE_DRIFT_EXCEEDED: 'The exchange rate moved since you saw the price. Nothing was sent; go back and confirm the new price.',
  INSUFFICIENT_BALANCE: 'We could not send this right now. Nothing was taken; please try again later.',
  PAYOUT_LIMIT_EXCEEDED: 'This is over a payout limit. Nothing was sent; try a smaller amount.',
  VALIDATION_ERROR: 'Something in this request was not accepted. Nothing was sent.',
};

function StatusLine({ wd }: { wd: Withdrawal }) {
  switch (wd.status) {
    case 'creating':
    case 'sent':
    case 'processing':
      return <p><span className="spinner" />Sending {money(wd.amount)} to ····{wd.last4}…</p>;
    case 'unknown':
      return wd.needsSupport
        ? <div className="note error">We could not confirm this payment yet. Do not send it again; contact support and quote {wd.reference}.</div>
        : <p><span className="spinner" />Confirming this payment. It may already be on its way, so there is no need to send it again.</p>;
    case 'canceled':
      return <p>This payment was canceled before it was sent. Nothing was taken.</p>;
    case 'awaiting_approval':
      return <p>This one needs an approval first. You will see it move as soon as it is approved.</p>;
    case 'completed':
      return <p>Paid. {wd.destinationAmount ? `${wd.destinationAmount} ${wd.destinationCurrency} was` : 'It was'} credited to ····{wd.last4}.</p>;
    case 'returned':
      return <p>Your bank sent this payment back. The money is back on your balance; check the account details and try again.</p>;
    case 'failed':
      return wd.fundsReturned
        ? <p>This payment did not go through: {reason(wd.failureCode)}. The money is back on your balance.</p>
        : <p>This payment did not go through: {reason(wd.failureCode)}. The money has not come back yet; we will update this when it does.</p>;
    case 'error':
      return <div className="note error">{REFUSAL[wd.error?.type ?? ''] ?? 'This payment could not be sent. Nothing was taken.'}</div>;
    default:
      return null;
  }
}

/** One withdrawal: its status, what it means for the payee, and its timeline. */
export function WithdrawalScreen({ wd, onBack }: { wd: Withdrawal; onBack: () => void }) {
  return (
    <Screen footer={isSettled(wd.status) ? <button className="cta" onClick={onBack}>Back to home</button> : undefined}>
      <div className="card">
        <div className="row"><h3>{money(wd.amount)} withdrawal</h3><StatusPill status={wd.status} /></div>
        {/* A fee is only charged on a payout that was paid. */}
        <div className="muted">Reference {wd.reference}{wd.fee && wd.status === 'completed' ? ` · fee ${money(wd.fee)}` : ''}</div>
        <StatusLine wd={wd} />
      </div>
      <ul className="timeline">
        {wd.timeline.map((t, i) => (
          <li key={i}><span className="t">{hhmmss(t.at)}</span><span className="s">{t.source}</span><span>{t.note || t.status}</span></li>
        ))}
      </ul>
    </Screen>
  );
}
