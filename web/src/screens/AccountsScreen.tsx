import { useState } from 'react';
import { money } from '../api/client';
import { Account } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

interface Props {
  accounts: Account[];
  selected: string | null;
  amount: string;
  onSelect: (destinationAccountId: string) => void;
  onAdd: () => void;
  onRemove: (methodId: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}

/** Pay into: the payee's saved accounts (by last4 only), or a new one. */
export function AccountsScreen({ accounts, selected, amount, onSelect, onAdd, onRemove, onContinue, onBack }: Props) {
  const [removing, setRemoving] = useState<string | null>(null);

  const footer = (
    <>
      <button className="cta" disabled={!selected} onClick={onContinue}>Continue</button>
      <BackLink onClick={onBack} />
    </>
  );

  return (
    <Screen footer={footer}>
      <h3>Pay {money(amount)} into</h3>
      {accounts.length === 0 && <p className="muted">No account saved yet. Add the one to pay into; it is saved for next time.</p>}
      {accounts.map((a) => (
        <label key={a.id} className={'choice' + (a.destinationAccountId === selected ? ' on' : '')}>
          <input type="radio" name="account" checked={a.destinationAccountId === selected} onChange={() => onSelect(a.destinationAccountId)} />
          <span className="who">····{a.last4}</span>
          <span className="acct">{a.currency} · added {new Date(a.registeredAt).toLocaleDateString()}</span>
          <button
            type="button"
            className="link"
            disabled={removing === a.id}
            onClick={async (e) => { e.preventDefault(); setRemoving(a.id); try { await onRemove(a.id); } finally { setRemoving(null); } }}
          >
            {removing === a.id ? '…' : 'Remove'}
          </button>
        </label>
      ))}
      <button className="cta secondary" onClick={onAdd}>+ Add a new account</button>
    </Screen>
  );
}
