import { useState } from 'react';
import { firstName, initials } from '../api/client';
import { Account } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

interface Props {
  accounts: Account[];
  onPick: (account: Account) => void;
  onAdd: () => void;
  onRemove: (methodId: string) => Promise<void>;
  onBack: () => void;
}

/** Who to send to: saved recipients (name, bank and last four only), or someone new. */
export function RecipientsScreen({ accounts, onPick, onAdd, onRemove, onBack }: Props) {
  const [removing, setRemoving] = useState<string | null>(null);
  return (
    <Screen footer={<><button className="cta secondary" style={{ marginTop: 0 }} onClick={onAdd}>Add someone new</button><BackLink onClick={onBack} /></>}>
      <h2 className="title">Who are you sending to?</h2>
      {accounts.map((a) => (
        <div key={a.id} className="account" role="button" tabIndex={0} onClick={() => onPick(a)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(a)}>
          <span className="face">{initials(a.holder ?? 'Me')}</span>
          <span className="who"><strong>{a.holder ?? 'My account'}</strong><span className="muted">{a.bank ?? 'Bank'} ····{a.last4}</span></span>
          <button
            type="button"
            className="link"
            disabled={removing === a.id}
            onClick={async (e) => { e.stopPropagation(); if (!window.confirm(`Remove ${a.holder ? firstName(a.holder) : 'this account'}?`)) return; setRemoving(a.id); try { await onRemove(a.id); } finally { setRemoving(null); } }}
          >
            {removing === a.id ? '…' : 'Remove'}
          </button>
        </div>
      ))}
    </Screen>
  );
}
