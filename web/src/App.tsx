// The page: Avvio's framing on top, the partner's app in a phone on the left,
// and on the right every call its backend makes to Avvio. The app never sees
// the Avvio API key: it talks only to its own backend.
import { useCallback, useEffect, useState } from 'react';
import { api, initials } from './api/client';
import { Account, isSettled, ServerState, Withdrawal } from './api/types';
import { Console } from './components/Console';
import { useWithdrawalPolling } from './hooks/useWithdrawalPolling';
import { ActivityScreen } from './screens/ActivityScreen';
import { AmountScreen } from './screens/AmountScreen';
import { BankFormScreen } from './screens/BankFormScreen';
import { ConfirmScreen } from './screens/ConfirmScreen';
import { HomeScreen } from './screens/HomeScreen';
import { RecipientsScreen } from './screens/RecipientsScreen';
import { WithdrawalScreen } from './screens/WithdrawalScreen';

type Tab = 'home' | 'activity';
type Step = 'home' | 'recipients' | 'bank' | 'amount' | 'confirm' | 'withdrawal';

const RAIL = ['Recipient', 'Amount', 'Review', 'Track'];
const RAIL_INDEX: Record<Step, number> = { home: 0, recipients: 0, bank: 0, amount: 1, confirm: 2, withdrawal: 3 };
const REPO = 'https://github.com/anzolabs/avvio-payout-demo';

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
  // The phone is drawn at true size; scale it so the whole device fits the window.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.max(0.62, Math.min(0.9, (window.innerHeight - 90) / 904)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

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

  const pick = (a: Account) => { setSelected(a.destinationAccountId); go('amount'); };

  const view = (() => {
    if (tab === 'activity') return <ActivityScreen payeeId={payeeId} onOpen={(w) => { setCurrent(w); go('withdrawal'); }} onStart={home} />;
    switch (step) {
      case 'recipients':
        return <RecipientsScreen accounts={accounts} onPick={pick} onAdd={() => go('bank')} onRemove={async (id) => setAccounts((await api.removeAccount(payeeId, id)).accounts)} onBack={home} />;
      case 'bank':
        return <BankFormScreen payeeId={payeeId} payee={payee} currencies={server.currencies} sandboxAccounts={server.sandboxAccounts} onSaved={async (acc) => { await loadAccounts(payeeId); setSelected(acc.destinationAccountId); go('amount'); }} onBack={() => (accounts.length ? go('recipients') : home())} />;
      case 'amount':
        if (!account) return null;
        return <AmountScreen payee={payee} account={account} initialAmount={amount} onReview={(a) => { setAmount(a); go('confirm'); }} onBack={() => go('recipients')} />;
      case 'confirm':
        if (!account) return null;
        return <ConfirmScreen amount={amount} account={account} payee={payee} onSend={async (requestId, expectDestination, purposeOfPayment) => { setCurrent(await api.withdraw({ payeeId, amount, destinationAccountId: account.destinationAccountId, requestId, expectDestination, purposeOfPayment })); go('withdrawal'); }} onBack={() => go('amount')} />;
      case 'withdrawal':
        if (!current) return null;
        return <WithdrawalScreen wd={current} onBack={home} />;
      default:
        // First run: nobody saved yet, so "Send money" goes straight to adding someone.
        return <HomeScreen payee={payee} server={server} accounts={accounts} onSend={() => go(accounts.length ? 'recipients' : 'bank')} onPick={pick} onNew={() => go('bank')} onOpen={(w) => { setCurrent(w); go('withdrawal'); }} />;
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
          <p>Someone sends money to family in Mexico. On the left, your app. On the right, every call your backend makes to Avvio: real requests, test money.</p>
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

      <main className="stage" data-show={show} style={{ '--s': scale } as React.CSSProperties}>
        <div className="col-app">
          <ol className="rail" aria-label="Steps">
            {RAIL.map((r, i) => <li key={r} className={i < at ? 'done' : i === at ? 'now' : ''}>{String(i + 1).padStart(2, '0')} {r}</li>)}
          </ol>
          <div className="fit"><div className="device">
            <span className="btn-l action" /><span className="btn-l vol-up" /><span className="btn-l vol-down" />
            <span className="btn-r side" /><span className="btn-r camera" />
            <section className="phone" aria-label="Your app (the demo partner, Payday)">
              <div className="statusbar" aria-hidden="true">
                <span>9:41</span>
                <span className="island" />
                <span className="sb-icons">
                  <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
                  <svg viewBox="0 0 16 12"><path d="M8 11.5l2.4-2.9a3.6 3.6 0 00-4.8 0L8 11.5zM3.3 6.4a7 7 0 019.4 0l1.6-1.9a9.6 9.6 0 00-12.6 0l1.6 1.9z" /></svg>
                  <svg viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="18" height="9" rx="2" /><rect x="24.5" y="4.5" width="1.5" height="4" rx=".75" opacity=".4" /></svg>
                </span>
              </div>
              <header className="app-top">
                <div className="app-brand">Payday<span>.</span></div>
                <div className="avatar" title={payee.name}>{initials(payee.name)}</div>
              </header>
              <div className="screen" key={`${tab}-${step}`}>{view}</div>
              <nav className="tabs">
                <button className={tab === 'home' ? 'active' : ''} onClick={() => { setTab('home'); if (current && isSettled(current.status)) setCurrent(null); }}>
                  <svg viewBox="0 0 24 24"><path d="M12 3.2 2.8 11a1 1 0 0 0 1.3 1.5L5 11.8V20a1 1 0 0 0 1 1h4.5v-6h3v6H18a1 1 0 0 0 1-1v-8.2l.9.7A1 1 0 0 0 21.2 11z" /></svg>Home
                </button>
                <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
                  <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6 3.2 1.9a1 1 0 0 1-1 1.7l-3.7-2.2A1 1 0 0 1 11 13V7a1 1 0 0 1 2 0z" /></svg>Activity
                </button>
              </nav>
              <div className="home-bar" aria-hidden="true" />
            </section>
          </div></div>
        </div>
        <Console server={server} />
      </main>
    </div>
  );
}
