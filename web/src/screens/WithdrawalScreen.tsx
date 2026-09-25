import { hhmmss, money } from '../api/client';
import { isSettled, Withdrawal } from '../api/types';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';

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
      return <p>Sent. {wd.destinationAmount ? `${wd.destinationAmount} ${wd.destinationCurrency} is` : 'It is'} on its way to ····{wd.last4}.</p>;
    case 'returned':
      return <p>Your bank sent this payment back. The money is back on your balance; check the account details and try again.</p>;
    case 'failed':
      return wd.fundsReturned
        ? <p>This payment could not be sent ({wd.failureCode ?? 'failed'}). The money is back on your balance.</p>
        : <p>This payment did not go through ({wd.failureCode ?? 'failed'}). The money has not come back yet; we will update this when it does.</p>;
    case 'error':
      return <div className="note error">{wd.error?.type}: {wd.error?.message}</div>;
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
        <div className="muted">Reference {wd.reference}{wd.fee ? ` · fee ${money(wd.fee)}` : ''}</div>
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
