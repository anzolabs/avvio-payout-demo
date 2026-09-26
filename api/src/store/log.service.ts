import { Injectable, Logger } from '@nestjs/common';
import { ApiCall, LogLine } from './state.types';
import { visitorContext, visitorOfId } from '../visitor';

// Shared by every visitor in the hosted demo, so it keeps more.
const MAX_LOG = 2000;
// ponytail: responses are kept for the console, capped; a full /events page is not worth shipping to a browser.
const MAX_BODY = 4000;

/**
 * What the backend did, kept for the console panel and echoed to stdout.
 * In memory: the console is a live view, and API bodies are too big to rewrite
 * the state file for on every line.
 */
@Injectable()
export class LogService {
  private readonly logger = new Logger('demo');
  private readonly lines: LogLine[] = [];

  log(source: LogLine['source'], message: string, extra?: Record<string, unknown>, call?: ApiCall): void {
    const vid = visitorOfId(message) || visitorContext.getStore() || '';
    const line: LogLine = { at: new Date().toISOString(), source, message, ...(extra ? { extra } : {}), ...(call ? { call } : {}), ...(vid ? { vid } : {}) };
    this.lines.push(line);
    if (this.lines.length > MAX_LOG) this.lines.splice(0, this.lines.length - MAX_LOG);
    this.logger.log(`[${source}] ${message}`);
  }

  /** One request to Avvio, as the console shows it: never the key, never a full account number. */
  call(c: Omit<ApiCall, 'req' | 'res'> & { req?: unknown; res?: unknown }): void {
    const call: ApiCall = { ...c, req: clip(mask(c.req)), res: clip(mask(c.res)) };
    this.log('call', `${c.method} ${c.path} → ${c.status || 'no response'}`, c.requestId ? { requestId: c.requestId } : undefined, call);
  }

  /** Lines about no one in particular, plus this visitor's own. */
  since(after: string, vid = ''): LogLine[] {
    return this.lines.filter((l) => l.at > after && (!l.vid || l.vid === vid));
  }
}

/** Any run of 8+ digits (a CLABE, an account number) becomes ····last4. */
export function mask(v: unknown): unknown {
  if (typeof v === 'string') return /^\d{8,}$/.test(v.replace(/\s/g, '')) ? '····' + v.slice(-4) : v;
  if (Array.isArray(v)) return v.map(mask);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]));
  return v;
}

function clip(v: unknown): unknown {
  if (v === undefined) return undefined;
  const text = JSON.stringify(v);
  return text.length > MAX_BODY ? { truncated: true, preview: text.slice(0, MAX_BODY) + '…' } : v;
}
