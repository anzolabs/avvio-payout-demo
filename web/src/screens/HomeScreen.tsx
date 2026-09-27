import { useEffect, useState } from 'react';
import { api, firstName, initials, money } from '../api/client';
import { flagOf } from '../api/currencies';
import { Account, Payee, ServerState, Withdrawal } from '../api/types';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';

interface Props {
  payee: Payee;
  server: ServerState;
  accounts: Account[];
  onSend: () => void;
  onPick: (account: Account) => void;
  onNew: () => void;
  onOpen: (w: Withdrawal) => void;
}

/** Home: funds available to send, the people you send to, and what went out lately. */
export function HomeScreen({ payee, server, accounts, onSend, onPick, onNew, onOpen }: Props) {
  const [recent, setRecent] = useState<Withdrawal[]>([]);
  useEffect(() => {
    api.withdrawals().then((l) => setRecent(l.filter((w) => w.payeeId === payee.id).slice(0, 3))).catch(() => undefined);
  }, [payee.id]);

  return (
    <Screen footer={<button className="cta" onClick={onSend}>Send money</button>}>
      <p className="hello">Hi {firstName(payee.name)}</p>
      <div className="balance">
        <div className="eyebrow">Funds available</div>
        <div className="amount num">{money(payee.left)}</div>
        <div className="sub">{payee.note}</div>
      </div>

      <div className="section-head"><span className="eyebrow">Send to</span></div>
      <div className="people">
        {accounts.map((a) => (
          <button key={a.id} className="person" onClick={() => onPick(a)}>
            <span className="face">{initials(a.holder ?? payee.name)}<span className="face-flag" aria-label={a.currency}>{flagOf(a.currency)}</span></span>
            <span>{firstName(a.holder ?? 'Me')}</span>
          </button>
        ))}
        <button className="person" onClick={onNew}>
          <span className="face add">+</span>
          <span>New</span>
        </button>
      </div>

      <div className="section-head"><span className="eyebrow">Recent</span></div>
      {recent.length === 0 && <p className="muted">Nothing sent yet.</p>}
      {recent.map((w) => (
        <button className="activity" key={w.id} onClick={() => onOpen(w)}>
          <span className="face sm">{initials(w.holder ?? payee.name)}</span>
          <span className="who"><strong>{w.holder ?? 'My account'}</strong><br /><span className="muted num">{money(w.amount)}</span></span>
          <StatusPill status={w.status} />
        </button>
      ))}
      {(!server.configured || server.bootError) && <div className="note error">{server.bootError ?? 'Backend is not configured.'}</div>}
    </Screen>
  );
}
