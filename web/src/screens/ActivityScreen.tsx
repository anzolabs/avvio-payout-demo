import { useEffect, useState } from 'react';
import { api, money } from '../api/client';
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
          <span className="who"><strong className="num">{money(w.amount)}</strong><br /><span className="muted">····{w.last4 ?? '????'} · {new Date(w.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
          <StatusPill status={w.status} />
        </button>
      ))}
      {!mine.length && (
        <div className="empty">
          <p><strong>No withdrawals yet</strong></p>
          <p className="muted">Your first one shows up here, with every step it takes.</p>
          <button className="cta secondary" onClick={onStart}>Make one</button>
        </div>
      )}
    </Screen>
  );
}
