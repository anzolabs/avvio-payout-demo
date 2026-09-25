import { useState } from 'react';
import { money } from '../api/client';
import { Payee, ServerState } from '../api/types';
import { Screen } from '../components/Screen';

const AMOUNTS = ['50.00', '75.00', '100.00'];

interface Props {
  payee: Payee;
  server: ServerState;
  initialAmount: string;
  onWithdraw: (amount: string) => void;
}

/** Home: what the payee can withdraw and how much they want. */
export function HomeScreen({ payee, server, initialAmount, onWithdraw }: Props) {
  const [amount, setAmount] = useState(initialAmount);
  const [custom, setCustom] = useState('');

  const value = custom || amount;
  const valid = /^\d{1,6}(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= Number(payee.left);

  return (
    <Screen footer={<button className="cta" disabled={!valid} onClick={() => onWithdraw(Number(value).toFixed(2))}>Withdraw {valid ? money(value) : ''}</button>}>
      <div className="hero">
        <div className="label">Available to withdraw</div>
        <div className="amount">{money(payee.left)}</div>
        <div className="sub">{payee.note}</div>
      </div>
      <h3>How much?</h3>
      <div className="chips">
        {AMOUNTS.map((a) => (
          <button key={a} className={!custom && a === amount ? 'on' : ''} onClick={() => { setAmount(a); setCustom(''); }}>{money(a)}</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="custom">Or another amount (USD)</label>
        <input id="custom" inputMode="decimal" placeholder="0.00" value={custom} onChange={(e) => setCustom(e.target.value.trim())} />
        {custom && !valid && <p className="field-err">Enter an amount up to {money(payee.left)}</p>}
      </div>
      <p className="muted">Next: choose the account to pay into, then confirm the price.</p>
      {!server.configured && <div className="note error">{server.bootError ?? 'Backend is not configured.'}</div>}
    </Screen>
  );
}
