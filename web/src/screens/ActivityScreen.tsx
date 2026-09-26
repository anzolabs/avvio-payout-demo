import { useEffect, useState } from 'react';
import { api, initials, money } from '../api/client';
import { Withdrawal } from '../api/types';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';

/** Activity: the signed-in payee's withdrawals, newest first. */
export function ActivityScreen({ payeeId, onOpen, onStart }: { payeeId: string; onOpen: (w: Withdrawal) => void; onStart: () => void }) {
  const [list, setList] = useState<Withdrawal[] | null>(null);

  useEffect(() => {
    api.withdrawals().then(setList).catch(() => setList([]));
  }, [payeeId]);

  if (!list) return <Screen><p className="muted">Loading…</p></Screen>;
  const mine = list.filter((w) => w.payeeId === payeeId);
  return (
    <Screen>
      <h2 className="title">Activity</h2>
      {mine.map((w) => (
        <button className="activity" key={w.id} onClick={() => onOpen(w)}>
          <span className="face sm">{initials(w.holder ?? 'Me')}</span>
          <span className="who"><strong>{w.holder ?? 'My account'}</strong> <span className="num">{money(w.amount)}</span><br /><span className="muted">····{w.last4 ?? '????'} · {new Date(w.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
          <StatusPill status={w.status} />
        </button>
      ))}
      {!mine.length && (
        <div className="empty">
          <p><strong>Nothing sent yet</strong></p>
          <p className="muted">Money you send shows up here, with every step it takes.</p>
          <button className="cta secondary" onClick={onStart}>Send money</button>
        </div>
      )}
    </Screen>
  );
}
