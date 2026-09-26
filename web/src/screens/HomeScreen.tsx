import { useEffect, useState } from 'react';
import { api, money } from '../api/client';
import { Payee, Quote, ServerState } from '../api/types';
import { Screen } from '../components/Screen';

const AMOUNTS = ['50.00', '75.00', '100.00'];

interface Props {
  payee: Payee;
  server: ServerState;
  initialAmount: string;
  onWithdraw: (amount: string) => void;
}

/** Home: what the payee can withdraw, how much they want, and what the bank will receive. */
export function HomeScreen({ payee, server, initialAmount, onWithdraw }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [custom, setCustom] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);

  const value = custom || amount;
  const valid = /^\d{1,6}(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= Number(payee.left);

  // An indicative price as they choose, debounced: GET /rates on the backend.
  useEffect(() => {
    if (!valid || !server.configured) { setQuote(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { api.quote(Number(value).toFixed(2)).then((q) => live && setQuote(q)).catch(() => live && setQuote(null)); }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [value, valid, server.configured]);

  return (
    <Screen footer={<button className="cta" disabled={!valid} onClick={() => onWithdraw(Number(value).toFixed(2))}>Withdraw {valid ? money(value) : ''}</button>}>
      <div className="balance">
        <div className="eyebrow">Available to withdraw</div>
        <div className="amount num">{money(payee.left)}</div>
        <div className="sub">{payee.note}</div>
      </div>
      <span className="eyebrow">How much</span>
      <div className="chips">
        {AMOUNTS.map((a) => (
          <button key={a} className={!custom && a === amount ? 'on' : ''} onClick={() => { setAmount(a); setCustom(''); }}>{money(a)}</button>
        ))}
      </div>
      <div className="field">
        <input id="custom" aria-label="Another amount in USD" inputMode="decimal" placeholder="Another amount, USD" value={custom} onChange={(e) => setCustom(e.target.value.trim())} />
        {custom && !valid && <p className="field-err">Enter an amount up to {money(payee.left)}</p>}
      </div>
      {quote && (
        <div className="preview">
          <span className="muted">The bank receives about</span>
          <strong className="num">{Number(quote.destinationAmount.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quote.destinationAmount.currency}</strong>
        </div>
      )}
      {(!server.configured || server.bootError) && <div className="note error">{server.bootError ?? 'Backend is not configured.'}</div>}
    </Screen>
  );
}
