import { hhmmss, money } from '../api/client';
import { purposeLabel } from '../api/currencies';
import { isSettled, Withdrawal, WithdrawalStatus } from '../api/types';
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

// How far along the happy path a withdrawal got: 0 nothing confirmed, 1 sent, 2 processing, 3 paid.
function reached(wd: Withdrawal): number {
  const seen = (s: WithdrawalStatus) => wd.status === s || wd.timeline.some((t) => t.status === s);
  if (seen('completed')) return 3;
  if (seen('processing')) return 2;
  if (seen('sent') || wd.status === 'failed') return 1;
  return 0;
}

const Check = () => <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" strokeLinecap="round" /></svg>;
const Back = () => <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Hero({ wd }: { wd: Withdrawal }) {
  const dest = wd.destinationAmount ? `${Number(wd.destinationAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${wd.destinationCurrency}` : money(wd.amount);
  if (wd.status === 'completed') return <div className="done-hero"><div className="seal"><Check /></div><div className="big num">{dest}</div><span className="muted">paid to {wd.holder ?? 'your account'} ····{wd.last4}</span></div>;
  if (wd.status === 'returned') return <div className="done-hero"><div className="seal warn"><Back /></div><div className="big num">{money(wd.amount)}</div><span className="muted">is back in your balance. The bank returned it.</span></div>;
  if (wd.status === 'failed' || wd.status === 'error' || wd.status === 'canceled') return <div className="done-hero"><div className="seal bad"><Cross /></div><div className="big num">{money(wd.amount)}</div><span className="muted">{wd.status === 'failed' ? `did not go through: ${reason(wd.failureCode)}.` : 'was not sent.'}</span></div>;
  return <div className="done-hero"><span className="eyebrow">Sending</span><div className="big num">{money(wd.amount)}</div><span className="muted">to {wd.holder ?? 'your account'} ····{wd.last4}</span></div>;
}

function Detail({ wd }: { wd: Withdrawal }) {
  switch (wd.status) {
    case 'unknown':
      return wd.needsSupport
        ? <div className="note error">We could not confirm this payment yet. Do not send it again; contact support and quote {wd.reference}.</div>
        : <div className="note">Confirming this payment. It may already be on its way, so there is no need to send it again.</div>;
    case 'awaiting_approval':
      return <div className="note">This one needs an approval first. It moves as soon as someone approves it.</div>;
    case 'completed':
      return <div className="watching">Watching for a bank return: a paid payment can still come back.</div>;
    case 'returned':
      return <div className="note">Check the account details and try again.</div>;
    case 'failed':
      return <div className="note">{wd.fundsReturned ? 'The money is back in your balance.' : 'The money has not come back yet; this updates when it does.'}</div>;
    case 'error':
      // A known refusal in the sender's words; otherwise the API's own reason
      // (e.g. "Below the EUR minimum of 23.55 USD"), which is written for people.
      return <div className="note error">{REFUSAL[wd.error?.type ?? ''] ?? (wd.error?.message ? (/nothing was sent/i.test(wd.error.message) ? wd.error.message : `${wd.error.message.replace(/\.?$/, '.')} Nothing was sent.`) : 'This payment could not be sent. Nothing was taken.')}</div>;
    default:
      return null;
  }
}

/** One withdrawal: where it is, what it means for the payee, and when each step happened. */
export function WithdrawalScreen({ wd, onBack }: { wd: Withdrawal; onBack: () => void }) {
  const at = (s: WithdrawalStatus) => wd.timeline.find((t) => t.status === s)?.at;
  const r = reached(wd);
  const moving = !isSettled(wd.status) && wd.status !== 'awaiting_approval';
  const steps: { label: string; time?: string; cls: string }[] = wd.status === 'error' ? [] : [
    { label: 'Sent to Avvio', time: at('sent') ?? at('processing'), cls: r >= 1 ? 'done' : moving ? 'now' : '' },
    { label: 'Processing', time: at('processing'), cls: r >= 2 ? 'done' : r === 1 && moving ? 'now' : '' },
    { label: 'Paid', time: at('completed'), cls: r >= 3 ? 'done' : r === 2 && moving ? 'now' : '' },
  ];
  if (wd.status === 'returned') steps.push({ label: 'Returned by the bank', time: at('returned'), cls: 'warn' });
  if (wd.status === 'failed') steps.splice(r, 3 - r, { label: `Failed: ${reason(wd.failureCode)}`, time: at('failed'), cls: 'bad' });
  if (wd.status === 'canceled') steps.splice(r, 3 - r, { label: 'Canceled before sending', time: at('canceled'), cls: 'bad' });

  return (
    <Screen footer={isSettled(wd.status) ? <button className="cta" onClick={onBack}>Done</button> : undefined}>
      <div className="row" style={{ marginTop: 6 }}><span className="t" style={{ font: "12px var(--mono)", color: "var(--tx-mute)" }}>{wd.reference}</span><StatusPill status={wd.status} /></div>
      <Hero wd={wd} />
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.label} className={s.cls}>
            <span className="dot" />
            <strong>{s.label}</strong>
            <span className="t">{s.time ? hhmmss(s.time) : ''}</span>
          </li>
        ))}
      </ol>
      <Detail wd={wd} />
      <p className="muted">{wd.purposeOfPayment ? `Reason: ${purposeLabel(wd.purposeOfPayment)}` : ''}{wd.fee && wd.status === 'completed' ? `${wd.purposeOfPayment ? ' · ' : ''}Fee ${money(wd.fee)}` : ''}</p>
    </Screen>
  );
}
