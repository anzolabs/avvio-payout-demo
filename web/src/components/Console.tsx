import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, hhmmss } from '../api/client';
import { ServerState } from '../api/types';
import { useBackendLog } from '../hooks/useBackendLog';

const SCENARIOS: [string, string][] = [
  ['012180000000070003', 'completes, then the bank returns it'],
  ['012180000000000002', 'slow: shows processing, completes at 60 s'],
  ['012180000000030001', 'fails, account invalid'],
  ['012180000000045669', 'completes normally'],
];

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={'pill ' + cls}>{children}</span>;
}

/** The panel beside the phone: what the business's backend is doing, live. */
export function Console({ server }: { server: ServerState }) {
  const { lines, clear } = useBackendLog();
  const [balance, setBalance] = useState('');
  const pre = useRef<HTMLPreElement>(null);

  const refreshBalance = useCallback(async () => {
    try {
      const b = await api.balance();
      setBalance(`balance ${b.amount} ${b.currency}`);
    } catch {
      setBalance('');
    }
  }, []);

  useEffect(() => { if (server.configured) void refreshBalance(); }, [server.configured, refreshBalance]);
  useEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [lines]);

  const fund = async () => {
    try { await api.fundSandbox(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    void refreshBalance();
  };

  const p = server.policy;
  return (
    <aside className="console" aria-label="Backend console">
      <h2>Your backend</h2>
      <div className="badges">
        {server.configured ? <Badge cls={server.mode === 'live' ? 'red' : 'green'}>{server.mode} key</Badge> : <Badge cls="red">no API key</Badge>}
        <Badge cls="grey">{server.orgId ? `org ${server.orgId.slice(0, 8)}…` : 'no org id'}</Badge>
        {server.webhookConfigured ? <Badge cls="green">webhook secret set</Badge> : <Badge cls="amber">no webhook secret: polling + feed only</Badge>}
        {p && (p.thresholdUsd == null ? <Badge cls="green">no approval threshold</Badge> : <Badge cls="amber">threshold {p.thresholdUsd}: payouts above it wait for approval</Badge>)}
        <Badge cls="grey">pays {server.currency}</Badge>
      </div>
      <div className="tips">
        <strong>Sandbox outcomes.</strong> The last four digits of the account a payee registers pick what every payout to it does:
        <table><tbody>
          {SCENARIOS.map(([acct, what]) => <tr key={acct}><td><code>{acct}</code></td><td>{what}</td></tr>)}
        </tbody></table>
      </div>
      <div className="console-actions">
        <button onClick={fund}>Fund sandbox $1,000</button>
        <span>{balance}</span>
        <span className="spacer" />
        <button onClick={clear} title="Clears this panel only; the backend keeps its log">Clear</button>
      </div>
      <pre ref={pre} aria-live="polite">
        {lines.map((l, i) => (
          <Fragment key={i}>
            <span className={'src ' + l.source}>{hhmmss(l.at)} {l.source.padEnd(7)} </span>
            {l.message}{l.extra?.requestId ? `  [x-request-id ${l.extra.requestId}]` : ''}{'\n'}
          </Fragment>
        ))}
      </pre>
    </aside>
  );
}
