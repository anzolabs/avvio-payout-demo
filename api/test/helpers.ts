import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../src/config/app.config';
import { LogService } from '../src/store/log.service';
import { StateRepository } from '../src/store/state.repository';
import { Withdrawal } from '../src/store/state.types';

export function testConfig(): AppConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    currency: 'MXN',
    webhookSecret: '',
    dataFile: join(mkdtempSync(join(tmpdir(), 'avvio-demo-')), 'state.json'),
    webDist: '',
    avvio: { key: 'avvio_test_x', org: 'org_test', base: 'http://avvio.invalid', configured: true, mode: 'test' },
  } as AppConfig;
}

export function testStore(config = testConfig()) {
  const repo = new StateRepository(config);
  const log = new LogService(repo);
  // Keep test output quiet.
  (log as unknown as { logger: { log: () => void } }).logger = { log: () => undefined };
  return { config, repo, log };
}

export function withdrawal(over: Partial<Withdrawal> = {}): Withdrawal {
  const now = new Date().toISOString();
  return {
    id: 'wd_1', requestId: 'r1', payeeId: 'payee_4471', payeeName: 'Ana', amount: '75.00', sourceCurrency: 'USD',
    destinationAccountId: 'acct', last4: '0003', reference: 'DEMO-1', idempotencyKey: 'k1',
    status: 'sent', timeline: [], createdAt: now, updatedAt: now, ...over,
  };
}
