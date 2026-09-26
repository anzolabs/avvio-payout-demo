import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hhmmss, money } from '../api/client';
import { ApiCall, LogLine, ServerState } from '../api/types';
import { useBackendLog } from '../hooks/useBackendLog';

/** Sandbox accounts: the last four digits pick what every payout to them does. */
export const SCENARIOS: [string, string][] = [
  ['012180000000070003', 'completes, then the bank returns it'],
  ['012180000000000002', 'slow: shows processing, completes at 60 s'],
  ['012180000000030001', 'fails, account invalid'],
  ['012180000000045669', 'completes normally'],
];

// Housekeeping the backend does on its own; shown only when asked for.
const BACKGROUND_PATHS = /\/(events|policy|balance|sandbox\/fund)(\?|$)/;

type Kind = 'call' | 'event' | 'note';
interface Entry { key: string; line: LogLine; kind: Kind; background: boolean }

function classify(line: LogLine, i: number): Entry {
  const key = `${line.at}-${i}`;
  if (line.call) return { key, line, kind: 'call', background: BACKGROUND_PATHS.test(line.call.path) };
  if ((line.source === 'feed' || line.source === 'webhook') && /^payout/.test(line.message)) {
    return { key, line, kind: 'event', background: / no change$/.test(line.message) };
  }
  // The backend's own narration; the calls above already say what happened.
  // Lines that only echo a call already shown as its own row are background too.
  return { key, line, kind: 'note', background: line.source !== 'api' || /^(GET|POST|PUT|PATCH|DELETE) /.test(line.message) };
}

const codeClass = (s: number) => (s >= 200 && s < 300 ? '' : s >= 400 && s < 500 ? 'warn' : 'bad');

function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        style={{ position: 'absolute', right: 0, top: -22, border: 0, background: 'none', color: 'var(--c-dim)', font: '700 11px var(--font)', cursor: 'pointer' }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>{text}</pre>
    </div>
  );
}

function CallDetail({ call, base }: { call: ApiCall; base: string }) {
  return (
    <div className="detail">
      <h4>Request</h4>
      <div className="kv"><b>{call.method}</b> {base}{call.path}</div>
      {call.idempotencyKey && <div className="kv">Idempotency-Key: <b>{call.idempotencyKey}</b></div>}
      {call.req !== undefined && call.req !== null && <><h4>Body</h4><Json value={call.req} /></>}
      <h4>Response</h4>
      <div className="kv">
        <b>{call.status || 'no response'}</b> · {call.ms} ms{call.requestId ? <> · x-request-id <b>{call.requestId}</b></> : null}
        {call.replayed ? <> · <b>replayed</b>: the same key returned the stored answer</> : null}
      </div>
      {call.res !== undefined && call.res !== null && <><h4>Body</h4><Json value={call.res} /></>}
    </div>
  );
}

function Row({ e, open, fresh, onToggle, base, org }: { e: Entry; open: boolean; fresh: boolean; onToggle: () => void; base: string; org: string }) {
  const { line, kind } = e;
  if (kind === 'call' && line.call) {
    const c = line.call;
    return (
      <div className={'entry' + (fresh ? ' fresh' : '')}>
        <button type="button" onClick={onToggle} aria-expanded={open}>
          <span className="time">{hhmmss(line.at)}</span>
          <span className="verb">{c.method}</span>
          <span className="path">{(org ? c.path.replace(org, '{orgId}') : c.path).split('?')[0]}</span>
          <span className="meta"><span className={'code ' + codeClass(c.status)}>{c.status || '—'}</span><span>{c.ms} ms</span></span>
        </button>
        {open && <CallDetail call={c} base={base} />}
      </div>
    );
  }
  if (kind === 'event') {
    const [type] = line.message.split(' ');
    const now = line.message.match(/ now (\w+)$/)?.[1];
    return (
      <div className={'entry event' + (fresh ? ' fresh' : '')}>
        <button type="button" onClick={onToggle}>
          <span className="time">{hhmmss(line.at)}</span>
          <span className="verb">EVENT</span>
          <span className="path">{type}</span>
          <span className="meta"><span>via {line.source === 'webhook' ? 'webhook' : 'events feed'}</span>{now && <span>→ {now}</span>}</span>
        </button>
        {type === 'payout.returned' && now === 'returned' && (
          <div className="caption">The receiving bank sent the money back, days after “paid” in real life. Avvio told your backend, and the app updated on its own.</div>
        )}
        {open && <div className="detail"><div className="kv">{line.message}</div></div>}
      </div>
    );
  }
  return (
    <div className={'entry narr' + (fresh ? ' fresh' : '')}>
      <div className="line">
        <span className="time">{hhmmss(line.at)}</span>
        <span className="verb">{line.source === 'api' ? 'NOTE' : line.source.toUpperCase()}</span>
        <span className="path">{line.message}</span>
        <span />
      </div>
    </div>
  );
}

/** The dark half: what the business's backend says to Avvio, call by call. */
export function Console({ server }: { server: ServerState }) {
  const { lines, clear } = useBackendLog();
  const [balance, setBalance] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<number | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  const refreshBalance = useCallback(async () => {
    try { setBalance((await api.balance()).amount); } catch { setBalance(null); }
  }, []);

  useEffect(() => {
    if (!server.configured) return undefined;
    void refreshBalance();
    const t = setInterval(() => void refreshBalance(), 15_000);
    return () => clearInterval(t);
  }, [server.configured, refreshBalance]);

  const entries = lines.map(classify).filter((e) => showAll || !e.background);

  // Rows that arrive after the first load glow for a moment, so a tap in the app visibly causes a call here.
  useEffect(() => {
    if (seen.current === null) { seen.current = lines.length; return; }
    if (lines.length <= seen.current) { seen.current = lines.length; return; }
    const added = new Set(lines.slice(seen.current).map((l, i) => `${l.at}-${seen.current! + i}`));
    seen.current = lines.length;
    setFresh(added);
    const t = setTimeout(() => setFresh(new Set()), 1500);
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
    return () => clearTimeout(t);
  }, [lines]);

  const fund = async () => {
    try { await api.fundSandbox(); } catch { /* shown by the balance staying put */ }
    void refreshBalance();
  };

  const p = server.policy;
  return (
    <aside className="console" aria-label="Your backend and the Avvio API">
      <div className="console-head">
        <span className="eyebrow">Your backend ↔ Avvio API</span>
        <h3>Every call here is real.</h3>
        <div className="cpills">
          {server.configured ? <span className={'cpill ' + (server.mode === 'live' ? 'bad' : 'ok')}>{server.mode} key</span> : <span className="cpill bad">no API key</span>}
          <span className="cpill">{server.orgId ? `org ${server.orgId.slice(0, 8)}…` : 'no org id'}</span>
          {server.webhookConfigured ? <span className="cpill ok">webhook secret set</span> : <span className="cpill warn">no webhook secret: polling + feed only</span>}
          {p && (p.thresholdUsd == null ? <span className="cpill ok">no approval threshold</span> : <span className="cpill warn">approvals above {money(p.thresholdUsd)}</span>)}
          <span className="cpill">pays {server.currency}</span>
        </div>
        {server.publicDemo && (
          <p className="ctext">
            <b>Live demo on the Avvio sandbox.</b> Real API calls, test money, test accounts only. Your payees and payouts are visible to you alone.
            To run it with your own key, see <a href="https://github.com/anzolabs/avvio-payout-demo" target="_blank" rel="noreferrer">the repo</a>.
          </p>
        )}
        <div className="ctext">
          <b>Sandbox outcomes.</b> The last four digits of the account a recipient registers pick what every payout to it does:
          <table className="outcomes"><tbody>
            {SCENARIOS.map(([acct, what]) => <tr key={acct}><td><code>{acct}</code></td><td>{what}</td></tr>)}
          </tbody></table>
        </div>
        <div className="status-line">
          <span><span className="live-dot" />Balance <b className="num">{balance ? `${money(balance)} USD` : '…'}</b></span>
          {!server.publicDemo && server.configured && <button className="cbtn" onClick={fund}>Add $1,000 test money</button>}
        </div>
      </div>
      <div className="console-tools">
        <label><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Background activity</label>
        <span className="spacer" />
        <span>{entries.length} shown</span>
        <button onClick={clear} title="Clears this view only">Clear</button>
      </div>
      <div className="feed" ref={feed}>
        {entries.length === 0 && <div className="empty-feed">Tap <b>Send money</b> in the app. Each call your backend makes to Avvio appears here, with its request and response.</div>}
        {entries.map((e) => (
          <Row key={e.key} e={e} base={server.baseUrl} org={server.orgId} open={open === e.key} fresh={fresh.has(e.key)} onToggle={() => setOpen(open === e.key ? null : e.key)} />
        ))}
      </div>
    </aside>
  );
}
