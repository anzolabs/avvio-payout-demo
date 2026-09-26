// The page: Avvio's framing on top, the partner's app in a phone on the left,
// and on the right every call its backend makes to Avvio. The app never sees
// the Avvio API key: it talks only to its own backend.
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

const RAIL = ['Amount', 'Bank', 'Confirm', 'Track'];
const RAIL_INDEX: Record<Step, number> = { home: 0, accounts: 1, bank: 1, confirm: 2, withdrawal: 3 };
const REPO = 'https://github.com/anzolabs/avvio-payout-demo';
const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2);

export default function App() {
  const [server, setServer] = useState<ServerState | null>(null);
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // destinationAccountId
  const [tab, setTab] = useState<Tab>('home');
  const [step, setStep] = useState<Step>('home');
  const [amount, setAmount] = useState('75.00');
  const [current, setCurrent] = useState<Withdrawal | null>(null);
  const [show, setShow] = useState<'app' | 'api'>('app');

  useEffect(() => {
    void api.state().then((s) => { setServer(s); setPayeeId(s.payees[0].id); });
  }, []);

  // What each payee has left changes with every payout and every return:
  // re-read it whenever the payee is back on the home screen.
  useEffect(() => {
    if (step !== 'home' || tab !== 'home') return;
    void api.state().then(setServer).catch(() => undefined);
  }, [step, tab, current?.status]);

  const loadAccounts = useCallback(async (id: string) => {
    if (!server?.configured) return [];
    const res = await api.accounts(id);
    setAccounts(res.accounts);
    setSelected((sel) => (res.accounts.some((a) => a.destinationAccountId === sel) ? sel : res.accounts[0]?.destinationAccountId ?? null));
    return res.accounts;
  }, [server]);

  useEffect(() => { if (payeeId) void loadAccounts(payeeId); }, [payeeId, loadAccounts]);
  useWithdrawalPolling(current, setCurrent);

  if (!server || !payeeId) {
    return <div className="page"><div className="topbar"><img src="/avvio-logo-color.svg" alt="Avvio" /></div><p className="muted">Loading…</p></div>;
  }
  const payee = server.payees.find((p) => p.id === payeeId)!;
  const account = accounts.find((a) => a.destinationAccountId === selected) ?? null;

  const go = (s: Step) => { setStep(s); setTab('home'); };
  const home = () => { setCurrent(null); go('home'); };
  const switchPayee = (id: string) => { setPayeeId(id); setCurrent(null); go('home'); };

  const view = (() => {
    if (tab === 'activity') return <ActivityScreen payeeId={payeeId} onOpen={(w) => { setCurrent(w); go('withdrawal'); }} onStart={home} />;
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
        return <BankFormScreen payeeId={payeeId} payee={payee} onSaved={async (acc) => { await loadAccounts(payeeId); setSelected(acc.destinationAccountId); go('confirm'); }} onBack={() => (accounts.length ? go('accounts') : home())} />;
      case 'confirm':
        if (!account) return null;
        return <ConfirmScreen amount={amount} account={account} payee={payee} onSend={async (requestId, expectDestination) => { setCurrent(await api.withdraw({ payeeId, amount, destinationAccountId: account.destinationAccountId, requestId, expectDestination })); go('withdrawal'); }} onBack={() => go('accounts')} />;
      case 'withdrawal':
        if (!current) return null;
        return <WithdrawalScreen wd={current} onBack={home} />;
      default:
        // First run: no saved account, so go straight to adding one.
        return <HomeScreen payee={payee} server={server} initialAmount={amount} onWithdraw={(a) => { setAmount(a); go(accounts.length ? 'accounts' : 'bank'); }} />;
    }
  })();

  const at = tab === 'home' ? RAIL_INDEX[step] : -1;
  return (
    <div className="page">
      <header className="topbar">
        <a href="https://avvio.xyz" aria-label="Avvio"><img src="/avvio-logo-color.svg" alt="Avvio" /></a>
        <nav>
          <a className="btn ghost" href="https://docs.avvio.xyz" target="_blank" rel="noreferrer">Docs</a>
          <a className="btn ghost" href={REPO} target="_blank" rel="noreferrer">View the code</a>
          <a className="btn" href="https://business.avvio.xyz" target="_blank" rel="noreferrer">Get API keys</a>
        </nav>
      </header>

      <section className="intro">
        <div>
          <span className="eyebrow">Payouts API · live sandbox</span>
          <h1>Pay anyone, in their currency. One API.</h1>
          <p>An employee withdraws earned wages from the US to a bank in Mexico. On the left, your app. On the right, every call your backend makes to Avvio: real requests, test money.</p>
        </div>
        <label className="signed-in">
          <span className="eyebrow">Signed in to the app as</span>
          <select value={payeeId} onChange={(e) => switchPayee(e.target.value)}>
            {server.payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </section>

      <div className="switcher" role="tablist">
        <button className={show === 'app' ? 'on' : ''} onClick={() => setShow('app')}>Your app</button>
        <button className={show === 'api' ? 'on' : ''} onClick={() => setShow('api')}>API calls</button>
      </div>

      <main className="stage" data-show={show}>
        <div className="col-app">
          <ol className="rail" aria-label="Steps">
            {RAIL.map((r, i) => <li key={r} className={i < at ? 'done' : i === at ? 'now' : ''}>{String(i + 1).padStart(2, '0')} {r}</li>)}
          </ol>
          <div className="device">
            <section className="phone" aria-label="Your app (the demo partner, Payday)">
              <header className="app-top">
                <div className="app-brand">Payday<span>.</span></div>
                <div className="avatar" title={payee.name}>{initials(payee.name)}</div>
              </header>
              <div className="screen" key={`${tab}-${step}`}>{view}</div>
              <nav className="tabs">
                <button className={tab === 'home' ? 'active' : ''} onClick={() => { setTab('home'); if (current && isSettled(current.status)) setCurrent(null); }}>Home</button>
                <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button>
              </nav>
              <div className="powered">Payouts by Avvio</div>
            </section>
          </div>
        </div>
        <Console server={server} />
      </main>
    </div>
  );
}
