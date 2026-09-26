import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Account, Corridor, CorridorField, Payee } from '../api/types';
import { SCENARIOS } from '../components/Console';
import { BackLink, Screen } from '../components/Screen';

// The banks behind most CLABEs (the backend keeps the same list); the rest just show no name.
const CLABE_BANKS: Record<string, string> = {
  '002': 'Banamex', '012': 'BBVA México', '014': 'Santander', '021': 'HSBC', '030': 'Banbajío', '036': 'Inbursa',
  '044': 'Scotiabank', '058': 'Banregio', '072': 'Banorte', '127': 'Banco Azteca', '137': 'BanCoppel', '646': 'STP', '722': 'Mercado Pago',
};

// The same check the server applies for `checksum: "clabe"`: weights 3, 7, 1
// repeating over digits 1 to 17, each product mod 10 before summing.
function clabeOk(v: string): boolean {
  if (!/^\d{18}$/.test(v)) return false;
  const w = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (Number(v[i]) * w[i % 3]) % 10;
  return (10 - (sum % 10)) % 10 === Number(v[17]);
}

/** A UUID-shaped SHA-256 of the salt and the (sorted) details. */
async function requestIdFor(salt: string, details: Record<string, string>): Promise<string> {
  const text = salt + JSON.stringify(Object.keys(details).sort().map((k) => [k, details[k]]));
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validate(field: CorridorField, value: string): string | null {
  if (!value && field.required !== false) return `${field.title || field.id} is required`;
  if (value && field.pattern && !new RegExp(`^(?:${field.pattern})$`).test(value)) return `Check this ${field.title || field.id}`;
  if (value && field.checksum === 'clabe' && !clabeOk(value)) return 'The CLABE check digit does not match';
  return null;
}

interface Props {
  payeeId: string;
  payee: Payee;
  onSaved: (account: Account) => void;
  onBack: () => void;
}

/**
 * Add a bank account. The form is rendered from the corridor definition the
 * backend fetched from Avvio, never from a hardcoded field list. The account
 * number goes to the business's backend once and is not kept on this side.
 */
export function BankFormScreen({ payeeId, payee, onSaved, onBack }: Props) {
  const [corridor, setCorridor] = useState<Corridor | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  // One random salt per visit to this form. The request id is derived from it
  // and the details, so resubmitting the same details (even retyped) after a
  // timeout is the same request, registered once; different details are a
  // different request. The salt keeps the id from revealing the account.
  const [salt] = useState(() => crypto.randomUUID());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.corridor().then(setCorridor).catch((e: Error) => setError(e.message));
  }, []);

  if (!corridor) return <Screen>{error ? <div className="note error">{error}</div> : <p className="muted">Loading the form…</p>}</Screen>;

  const clabeField = corridor.fields.find((f) => f.checksum === 'clabe');

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const details: Record<string, string> = {};
    const errs: Record<string, string> = {};
    for (const f of corridor.fields) {
      const value = (values[f.id] ?? '').trim();
      const err = validate(f, value);
      if (err) errs[f.id] = err;
      if (value) details[f.id] = value;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setError('');
    try {
      const res = await api.addAccount(payeeId, details, await requestIdFor(salt, details));
      onSaved(res.account);
    } catch (e) {
      // The server names the field in errors[]; show it under the field when we can.
      const named = e instanceof ApiError ? e.errors.find((s) => corridor.fields.some((f) => s.startsWith(f.id + ':'))) : undefined;
      if (named) {
        const id = named.split(':')[0];
        setFieldErrors({ [id]: named.slice(id.length + 1).trim() });
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button className="cta" type="submit" form="bank" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
      <BackLink onClick={onBack} disabled={busy} />
    </>
  );

  const clabe = clabeField ? (values[clabeField.id] ?? '').replace(/\D/g, '') : '';
  const bank = clabe.length >= 3 ? CLABE_BANKS[clabe.slice(0, 3)] : undefined;

  return (
    <Screen footer={footer}>
      <form id="bank" onSubmit={submit}>
        <h2 className="title">Where should it go?</h2>
        <p className="muted">A {corridor.currency} bank account for {payee.name}. Saved for next time.</p>
        {corridor.fields.map((f) => (
          <div className="field" key={f.id}>
            <label htmlFor={f.id} className="eyebrow">{f.title || f.id}</label>
            {f.options?.length ? (
              <select id={f.id} value={values[f.id] ?? ''} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}>
                <option value="">Select…</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
              </select>
            ) : (
              <input
                id={f.id}
                type="text"
                autoComplete="off"
                className="num"
                inputMode={/\[0-9\]/.test(f.pattern ?? '') ? 'numeric' : 'text'}
                placeholder={f === clabeField ? '18 digits' : undefined}
                value={values[f.id] ?? ''}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
              />
            )}
            {f === clabeField && (
              <div className="hint">
                <span>{bank ?? (clabe.length >= 3 ? 'Bank not recognised' : '')}</span>
                <span className={clabeOk(clabe) ? 'ok' : ''}>{clabeOk(clabe) ? '✓ Valid CLABE' : clabe ? `${clabe.length}/18` : ''}</span>
              </div>
            )}
            {fieldErrors[f.id] && <p className="field-err">{fieldErrors[f.id]}</p>}
          </div>
        ))}
        {error && <div className="note error">{error}</div>}
        {clabeField && (
          <div className="tray">
            <span className="eyebrow">Sandbox · pick an outcome · not part of your app</span>
            {SCENARIOS.map(([acct, what]) => (
              <button type="button" key={acct} onClick={() => setValues({ ...values, [clabeField.id]: acct })}>
                <code>····{acct.slice(-4)}</code><span>{what}</span>
              </button>
            ))}
          </div>
        )}
      </form>
    </Screen>
  );
}
