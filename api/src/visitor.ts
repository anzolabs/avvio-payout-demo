import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * The hosted demo (DEMO_PUBLIC=1) is one backend and one sandbox key shared by
 * everyone who opens the page. Each browser gets a visitor id in a cookie, and
 * everything it creates carries that id: its payees are `payee_4471-v…`, its
 * withdrawals `wd_v…_…`. Reads are filtered by it, and so is the console log,
 * because every log line names the payee or withdrawal it is about.
 * Run locally, there is no visitor id and nothing changes.
 */
export const VID = /(?<![A-Za-z0-9])v[0-9a-f]{10}(?![A-Za-z0-9])/;
const COOKIE = 'avvio_demo_vid';


type WithVisitor = Request & { vid?: string };

/** The visitor a piece of work is for, so the calls it makes land in their console. */
export const visitorContext = new AsyncLocalStorage<string>();

export const visitorOf = (req: Request): string => (req as WithVisitor).vid ?? '';
export const visitorOfId = (id: string): string => id.match(VID)?.[0] ?? '';

export function assignVisitor(req: Request, res: Response, next: NextFunction): void {
  const cookie = (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1] ?? '';
  let vid = /^v[0-9a-f]{10}$/.test(cookie) ? cookie : '';
  if (!vid) {
    vid = 'v' + randomBytes(5).toString('hex');
    res.setHeader('Set-Cookie', `${COOKIE}=${vid}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`);
  }
  (req as WithVisitor).vid = vid;
  visitorContext.run(vid, next);
}

// ponytail: in-memory, per process. Enough for one small box; move to Cloudflare rate limiting if it ever isn't.
const WINDOW_MS = 10 * 60_000;
const MAX_WRITES = 40;
const writes = new Map<string, { n: number; until: number }>();

/** Caps changes (accounts, payouts) per IP, so one visitor cannot flood the shared sandbox. */
export function limitWrites(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || !req.path.startsWith('/api/')) return next();
  const ip = String(req.headers['cf-connecting-ip'] ?? req.ip ?? '');
  const now = Date.now();
  const w = writes.get(ip);
  if (!w || w.until < now) writes.set(ip, { n: 1, until: now + WINDOW_MS });
  else if (++w.n > MAX_WRITES) {
    res.setHeader('Retry-After', String(Math.ceil((w.until - now) / 1000)));
    res.status(429).json({ message: 'Too many changes from this address. Try again in a few minutes.' });
    return;
  }
  if (writes.size > 10_000) for (const [k, v] of writes) if (v.until < now) writes.delete(k);
  next();
}
