import { useEffect, useState } from 'react';
import { api, money } from '../api/client';
import { Account, Quote } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

interface Props {
  amount: string;
  account: Account;
  /** requestId identifies this tap; expectDestination is what the payee was shown. */
  onSend: (requestId: string, expectDestination?: string) => Promise<void>;
  onBack: () => void;
}

/** Review: the price, the account, one button. The figures are an estimate. */
export function ConfirmScreen({ amount, account, onSend, onBack }: Props) {
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

  const Row = ({ k, v }: { k: string; v: string }) => <div className="row summary"><span className="muted">{k}</span><span>{v}</span></div>;

  const footer = (
    <>
      <button className="cta" disabled={busy || !quote} onClick={send}>{busy ? 'Sending…' : `Confirm and send ${money(amount)}`}</button>
      <BackLink onClick={onBack} disabled={busy} />
    </>
  );

  return (
    <Screen footer={footer}>
      <h3>Review</h3>
      <div className="card">
        <Row k="You withdraw" v={money(amount)} />
        {quote && <Row k="Fee" v={money(quote.fee.amount)} />}
        {quote && <Row k="Rate" v={`1 USD = ${Number(quote.rate).toFixed(4)} ${quote.destinationAmount.currency}`} />}
        {quote && <Row k="You receive" v={`≈ ${Number(quote.destinationAmount.amount).toLocaleString()} ${quote.destinationAmount.currency}`} />}
        <Row k="Into" v={`····${account.last4}`} />
        {!quote && !error && <p className="muted">Pricing…</p>}
        <p className="muted">Estimated. The rate is set when you send.</p>
      </div>
      {error && <div className="note error">{error}</div>}
    </Screen>
  );
}
