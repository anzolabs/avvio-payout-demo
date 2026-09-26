import { useEffect, useState } from 'react';
import { api, money } from '../api/client';
import { Account, Payee, Quote } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

interface Props {
  amount: string;
  account: Account;
  payee: Payee;
  /** requestId identifies this tap; expectDestination is what the payee was shown. */
  onSend: (requestId: string, expectDestination?: string) => Promise<void>;
  onBack: () => void;
}

const fmt = (n: string | number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Review: what arrives first, then how it is priced, then one button. */
export function ConfirmScreen({ amount, account, payee, onSend, onBack }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // One id for this confirm screen: a double tap, or a retry after a timeout,
  // sends the same id and the backend returns the same withdrawal.
  const [requestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let live = true;
    api.quote(amount).then((q) => live && setQuote(q)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [amount]);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await onSend(requestId, quote?.destinationAmount.amount);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const Row = ({ k, v }: { k: string; v: string }) => <div className="row summary"><span className="muted">{k}</span><span className="num">{v}</span></div>;

  const footer = (
    <>
      <button className="cta" disabled={busy || !quote} onClick={send}>{busy ? 'Sending…' : `Confirm and send ${money(amount)}`}</button>
      <BackLink onClick={onBack} disabled={busy} />
    </>
  );

  return (
    <Screen footer={footer}>
      <h2 className="title">Review</h2>
      <div className="receive">
        <span className="eyebrow">{account.holder ?? payee.name} receives about</span>
        <div className="big num">{quote ? `${fmt(quote.destinationAmount.amount)} ${quote.destinationAmount.currency}` : '…'}</div>
        <span className="muted">into {account.bank ?? 'their bank'} ····{account.last4}</span>
      </div>
      <div className="card">
        <Row k="You send" v={money(amount)} />
        {quote && <Row k="Fee" v={money(quote.fee.amount)} />}
        {quote && <Row k="Rate" v={`1 USD = ${Number(quote.rate).toFixed(4)} ${quote.destinationAmount.currency}`} />}
        {!quote && !error && <p className="muted">Getting the price…</p>}
      </div>
      <p className="muted">An estimate. The rate is fixed when you send, and the payout is refused if it has moved more than 2% from this.</p>
      {error && <div className="note error">{error}</div>}
    </Screen>
  );
}
