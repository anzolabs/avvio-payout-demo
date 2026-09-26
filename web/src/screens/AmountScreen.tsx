import { useEffect, useState } from 'react';
import { api, firstName, fmt, money } from '../api/client';
import { Account, Payee, Quote } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

const AMOUNTS = ['50', '75', '100', '200'];

interface Props {
  payee: Payee;
  account: Account;
  initialAmount: string;
  onReview: (amount: string) => void;
  onBack: () => void;
}

/** How much: you send in USD, they receive in pesos, priced live as you type (GET /rates). */
export function AmountScreen({ payee, account, initialAmount, onReview, onBack }: Props) {
  const [value, setValue] = useState(String(Number(initialAmount)));
  const [quote, setQuote] = useState<Quote | null>(null);
  const valid = /^\d{1,6}(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= Number(payee.left);
  const to = account.holder ? firstName(account.holder) : 'your account';

  useEffect(() => {
    if (!valid) { setQuote(null); return undefined; }
    let live = true;
    const t = setTimeout(() => { api.quote(Number(value).toFixed(2)).then((q) => live && setQuote(q)).catch(() => live && setQuote(null)); }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [value, valid]);

  return (
    <Screen footer={<><button className="cta" disabled={!valid || !quote} onClick={() => onReview(Number(value).toFixed(2))}>Review</button><BackLink onClick={onBack} /></>}>
      <h2 className="title">Send to {to}</h2>
      <div className="fx">
        <label className="fx-row">
          <span className="eyebrow">You send</span>
          <span className="fx-amount"><span className="cur">$</span><input className="num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Amount in USD" /><span className="code">USD</span></span>
        </label>
        <div className="fx-mid">
          <span>{quote ? `Fee ${money(quote.fee.amount)}` : ' '}</span>
          <span>{quote ? `1 USD = ${Number(quote.rate).toFixed(4)} MXN` : valid ? 'Getting the rate…' : ' '}</span>
        </div>
        <div className="fx-row">
          <span className="eyebrow">{to === 'your account' ? 'You receive' : `${to} receives`}</span>
          <span className="fx-amount"><span className="num out">{quote ? fmt(quote.destinationAmount.amount) : '—'}</span><span className="code">MXN</span></span>
        </div>
      </div>
      <div className="chips">
        {AMOUNTS.map((a) => <button key={a} className={Number(value) === Number(a) ? 'on' : ''} onClick={() => setValue(a)}>${a}</button>)}
      </div>
      <p className={valid || !value ? 'muted' : 'field-err'}>{money(payee.left)} available to send</p>
    </Screen>
  );
}
