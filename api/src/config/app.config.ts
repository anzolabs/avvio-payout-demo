import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Everything the backend reads from the environment, resolved once at boot. */
export interface AppConfig {
  readonly port: number;
  /** Destination currency for every payout. MXN is the sandbox corridor. */
  readonly currency: string;
  /** The whsec_ secret of the registered webhook endpoint; empty = polling and feed only. */
  readonly webhookSecret: string;
  readonly dataFile: string;
  readonly webDist: string;
  readonly avvio: {
    readonly key: string;
    readonly org: string;
    readonly base: string;
    readonly configured: boolean;
    readonly mode: 'test' | 'live' | null;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const ROOT = join(__dirname, '..', '..', '..'); // repo root (api/dist/config -> repo)

/** A dependency-free .env loader. Real environment variables win over the file. */
function loadDotEnv(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function loadConfig(): AppConfig {
  loadDotEnv(join(ROOT, '.env'));
  const key = process.env.AVVIO_API_KEY ?? '';
  const org = process.env.AVVIO_ORG_ID ?? '';
  const base = (process.env.AVVIO_BASE_URL ?? 'https://api.avvio.xyz/business/api/v1').replace(/\/+$/, '');
  return {
    port: Number(process.env.PORT ?? 4300),
    currency: (process.env.DESTINATION_CURRENCY ?? 'MXN').toUpperCase(),
    webhookSecret: process.env.AVVIO_WEBHOOK_SECRET ?? '',
    dataFile: process.env.DATA_FILE ?? join(ROOT, 'api', 'data', 'state.json'),
    webDist: join(ROOT, 'web', 'dist'),
    avvio: {
      key,
      org,
      base,
      configured: /^avvio_(test|live)_/.test(key) && org.length > 0,
      mode: key.startsWith('avvio_live_') ? 'live' : key.startsWith('avvio_test_') ? 'test' : null,
    },
  };
}
