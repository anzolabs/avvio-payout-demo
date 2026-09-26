// The app's only network access: its own backend. Never Avvio.
import { Account, Corridor, LogLine, Quote, ServerState, Withdrawal } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly type?: string, readonly errors: string[] = []) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Every change is sent as JSON, even with nothing to say: the backend accepts
  // nothing else on /api, which is what keeps other sites from posting to it.
  const res = await fetch(path, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string | string[]; type?: string; errors?: string[] };
  // 502 carries a withdrawal in `error` state and 202 one whose outcome is
  // still being resolved; the screen renders both itself.
  if (!res.ok && res.status !== 502) {
    const message = Array.isArray(json.message) ? json.message.join(', ') : json.message ?? `HTTP ${res.status}`;
    throw new ApiError(message, res.status, json.type, json.errors ?? []);
  }
  return json as T;
}

export const api = {
  state: () => request<ServerState>('GET', '/api/state'),
  corridor: () => request<Corridor>('GET', '/api/corridor'),
  quote: (amount: string) => request<Quote>('GET', `/api/quote?amount=${encodeURIComponent(amount)}`),
  accounts: (payeeId: string) => request<{ accounts: Account[] }>('GET', `/api/payees/${payeeId}/accounts`),
  addAccount: (payeeId: string, details: Record<string, string>, requestId: string, holderName?: string) =>
    request<{ account: Account }>('POST', `/api/payees/${payeeId}/accounts`, { details, requestId, ...(holderName ? { holderName } : {}) }),
  removeAccount: (payeeId: string, methodId: string) =>
    request<{ accounts: Account[] }>('DELETE', `/api/payees/${payeeId}/accounts/${methodId}`),
  withdrawals: () => request<Withdrawal[]>('GET', '/api/withdrawals'),
  withdrawal: (id: string) => request<Withdrawal>('GET', `/api/withdrawals/${id}`),
  withdraw: (body: { payeeId: string; amount: string; destinationAccountId: string; requestId: string; expectDestination?: string }) =>
    request<Withdrawal>('POST', '/api/withdrawals', body),
  log: (after: string) => request<LogLine[]>('GET', `/api/log?after=${encodeURIComponent(after)}`),
  balance: () => request<{ amount: string; currency: string }>('GET', '/api/balance'),
  fundSandbox: () => request<{ balance: string }>('POST', '/api/sandbox/fund'),
};

export const money = (s: string | number): string => '$' + Number(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const hhmmss = (iso: string): string => new Date(iso).toTimeString().slice(0, 8);
export const fmt = (n: string | number): string => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const initials = (name: string): string => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const firstName = (name: string): string => name.split(/\s+/)[0];
