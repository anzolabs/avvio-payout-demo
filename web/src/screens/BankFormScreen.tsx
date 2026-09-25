import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Account, Corridor, CorridorField, Payee } from '../api/types';
import { BackLink, Screen } from '../components/Screen';

// The same check the server applies for `checksum: "clabe"`: weights 3, 7, 1
// repeating over digits 1 to 17, each product mod 10 before summing.
function clabeOk(v: string): boolean {
  if (!/^\d{18}$/.test(v)) return false;
  const w = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (Number(v[i]) * w[i % 3]) % 10;
  return (10 - (sum % 10)) % 10 === Number(v[17]);
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.corridor().then(setCorridor).catch((e: Error) => setError(e.message));
  }, []);

  if (!corridor) return <Screen>{error ? <div className="note error">{error}</div> : <p className="muted">Loading the form…</p>}</Screen>;

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
      const res = await api.addAccount(payeeId, details);
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
      <button className="cta" type="submit" form="bank" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button>
      <BackLink onClick={onBack} disabled={busy} />
    </>
  );

  return (
    <Screen footer={footer}>
      <form id="bank" onSubmit={submit}>
        <h3>Add a bank account</h3>
        <p className="muted">{corridor.currency} account for {payee.name}. Saved for next time.</p>
        {corridor.fields.map((f) => (
          <div className="field" key={f.id}>
            <label htmlFor={f.id}>{f.title || f.id}</label>
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
                inputMode={/\[0-9\]/.test(f.pattern ?? '') ? 'numeric' : 'text'}
                value={values[f.id] ?? ''}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
              />
            )}
            {fieldErrors[f.id] && <p className="field-err">{fieldErrors[f.id]}</p>}
          </div>
        ))}
        {error && <div className="note error">{error}</div>}
        <p className="muted">Sandbox: the last four digits decide what happens. See the console panel.</p>
      </form>
    </Screen>
  );
}
