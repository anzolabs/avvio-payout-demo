// The business's own app, in a phone frame, next to a console showing what
// its backend does. The flow: amount → choose (or add) an account → confirm →
// status. The app never sees the Avvio API key: it talks only to its backend.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { Account, isSettled, ServerState, Withdrawal } from './api/types';
import { Console } from './components/Console';
import { useWithdrawalPolling } from './hooks/useWithdrawalPolling';
import { AccountsScreen } from './screens/AccountsScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { BankFormScreen } from './screens/BankFormScreen';
import { ConfirmScreen } from './screens/ConfirmScreen';
import { HomeScreen } from './screens/HomeScreen';
import { WithdrawalScreen } from './screens/WithdrawalScreen';

type Tab = 'home' | 'activity';
type Step = 'home' | 'accounts' | 'bank' | 'confirm' | 'withdrawal';

export default function App() {
  const [server, setServer] = useState<ServerState | null>(null);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // destinationAccountId
  const [tab, setTab] = useState<Tab>('home');
  const [step, setStep] = useState<Step>('home');
  const [amount, setAmount] = useState('75.00');
  const [current, setCurrent] = useState<Withdrawal | null>(null);

  useEffect(() => {
    void api.state().then((s) => { setServer(s); setPayeeId(s.payees[0].id); });
  }, []);

  const loadAccounts = useCallback(async (id: string) => {
    if (!server?.configured) return;
    const res = await api.accounts(id);
    setAccounts(res.accounts);
    setSelected((sel) => (res.accounts.some((a) => a.destinationAccountId === sel) ? sel : res.accounts[0]?.destinationAccountId ?? null));
  }, [server]);

  useEffect(() => { if (payeeId) void loadAccounts(payeeId); }, [payeeId, loadAccounts]);
  useWithdrawalPolling(current, setCurrent);

  if (!server || !payeeId) return <div className="stage"><p className="muted">Loading…</p></div>;
  const payee = server.payees.find((p) => p.id === payeeId)!;
  const account = accounts.find((a) => a.destinationAccountId === selected) ?? null;

  const go = (s: Step) => { setStep(s); setTab('home'); };
  const home = () => { setCurrent(null); go('home'); };
  const switchPayee = (id: string) => { setPayeeId(id); setCurrent(null); go('home'); };

  const view = (() => {
    if (tab === 'activity') return <ActivityScreen payeeId={payeeId} onOpen={(w) => { setCurrent(w); go('withdrawal'); }} />;
    switch (step) {
      case 'accounts':
        return (
          <AccountsScreen
            accounts={accounts}
            selected={selected}
            amount={amount}
            onSelect={setSelected}
            onAdd={() => go('bank')}
            onRemove={async (id) => setAccounts((await api.removeAccount(payeeId, id)).accounts)}
            onContinue={() => go('confirm')}
            onBack={home}
          />
        );
      case 'bank':
        return <BankFormScreen payeeId={payeeId} payee={payee} onSaved={async (acc) => { await loadAccounts(payeeId); setSelected(acc.destinationAccountId); go('accounts'); }} onBack={() => go('accounts')} />;
      case 'confirm':
        if (!account) return null;
        return <ConfirmScreen amount={amount} account={account} onSend={async (requestId, expectDestination) => { setCurrent(await api.withdraw({ payeeId, amount, destinationAccountId: account.destinationAccountId, requestId, expectDestination })); go('withdrawal'); }} onBack={() => go('accounts')} />;
      case 'withdrawal':
        if (!current) return null;
        return <WithdrawalScreen wd={current} onBack={home} />;
      default:
        return <HomeScreen payee={payee} server={server} initialAmount={amount} onWithdraw={(a) => { setAmount(a); go('accounts'); }} />;
    }
  })();

  return (
    <div className="stage">
      <section className="phone" aria-label="The business's app (demo)">
        <header className="phone-top">
          <div className="brand">Avvio Payouts <span className="tag">demo</span></div>
          <select aria-label="Signed-in payee" value={payeeId} onChange={(e) => switchPayee(e.target.value)}>
            {server.payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </header>
        <main className="screen">{view}</main>
        <nav className="tabs">
          <button className={tab === 'home' ? 'active' : ''} onClick={() => { setTab('home'); if (current && isSettled(current.status)) setCurrent(null); }}>Home</button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button>
        </nav>
      </section>
      <Console server={server} />
    </div>
  );
}
