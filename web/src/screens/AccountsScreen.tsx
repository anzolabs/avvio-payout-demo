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

export const bankInitials = (bank: string | null) => (bank ?? 'Bank').replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3);

/** Pay into: the payee's saved accounts (bank and last four only), or a new one. */
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
      <h2 className="title">Send <span className="num">{money(amount)}</span> to</h2>
      {accounts.map((a) => (
        <div key={a.id} className={'account' + (a.destinationAccountId === selected ? ' on' : '')} role="radio" aria-checked={a.destinationAccountId === selected} tabIndex={0}
          onClick={() => onSelect(a.destinationAccountId)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(a.destinationAccountId)}>
          <span className="logo">{bankInitials(a.bank)}</span>
          <span className="who"><strong>{a.bank ?? 'Bank account'} ····{a.last4}</strong><span className="muted">{a.currency} · saved {new Date(a.registeredAt).toLocaleDateString()}</span></span>
          <button
            type="button"
            className="link"
            disabled={removing === a.id}
            onClick={async (e) => { e.stopPropagation(); if (!window.confirm(`Remove the account ending ${a.last4 ?? ''}?`)) return; setRemoving(a.id); try { await onRemove(a.id); } finally { setRemoving(null); } }}
          >
            {removing === a.id ? '…' : 'Remove'}
          </button>
        </div>
      ))}
      <button className="cta secondary" onClick={onAdd}>Add a bank account</button>
    </Screen>
  );
}
