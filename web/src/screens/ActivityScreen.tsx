import { useEffect, useState } from 'react';
import { api, money } from '../api/client';
import { Withdrawal } from '../api/types';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';

/** Activity: the signed-in payee's past withdrawals, newest first. */
export function ActivityScreen({ payeeId, onOpen }: { payeeId: string; onOpen: (w: Withdrawal) => void }) {
  const [list, setList] = useState<Withdrawal[] | null>(null);

  useEffect(() => {
    api.withdrawals().then(setList).catch(() => setList([]));
  }, [payeeId]);

  if (!list) return <Screen><p className="muted">Loading…</p></Screen>;
  const mine = list.filter((w) => w.payeeId === payeeId);
  return (
    <Screen>
      <h3>Your withdrawals</h3>
      {mine.map((w) => (
        <div className="card" key={w.id} onClick={() => onOpen(w)}>
          <div className="row"><strong>{money(w.amount)}</strong><StatusPill status={w.status} /></div>
          <div className="muted">{new Date(w.createdAt).toLocaleString()} · {w.reference}</div>
        </div>
      ))}
      {!mine.length && <p className="muted">Nothing yet.</p>}
    </Screen>
  );
}
