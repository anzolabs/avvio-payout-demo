// The app's only network access: its own backend. Never Avvio.
import { Account, Corridor, LogLine, Quote, ServerState, Withdrawal } from './types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly type?: string, readonly errors: string[] = []) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string | string[]; type?: string; errors?: string[] };
  // 502 carries a withdrawal in `error` state, which the screen renders itself.
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
  addAccount: (payeeId: string, details: Record<string, string>) =>
    request<{ account: Account }>('POST', `/api/payees/${payeeId}/accounts`, { details }),
  removeAccount: (payeeId: string, methodId: string) =>
    request<{ accounts: Account[] }>('DELETE', `/api/payees/${payeeId}/accounts/${methodId}`),
  withdrawals: () => request<Withdrawal[]>('GET', '/api/withdrawals'),
  withdrawal: (id: string) => request<Withdrawal>('GET', `/api/withdrawals/${id}`),
  withdraw: (payeeId: string, amount: string, destinationAccountId: string) =>
    request<Withdrawal>('POST', '/api/withdrawals', { payeeId, amount, destinationAccountId }),
  log: (after: string) => request<LogLine[]>('GET', `/api/log?after=${encodeURIComponent(after)}`),
  balance: () => request<{ amount: string; currency: string }>('GET', '/api/balance'),
  fundSandbox: () => request<{ balance: string }>('POST', '/api/sandbox/fund'),
};

export const money = (s: string | number): string => '$' + Number(s).toFixed(2);
export const hhmmss = (iso: string): string => new Date(iso).toTimeString().slice(0, 8);
