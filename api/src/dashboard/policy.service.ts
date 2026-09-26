import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError } from '../avvio/avvio.error';
import { Policy } from '../avvio/avvio.types';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';

/** Reads the organization's policy once at boot and keeps it for the console badges. */
@Injectable()
export class PolicyService implements OnApplicationBootstrap {
  policy: Policy | null = null;
  bootError: string | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly log: LogService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.avvio.configured) {
      this.bootError = 'AVVIO_API_KEY or AVVIO_ORG_ID is not set. Copy .env.example to .env and fill it in.';
      this.log.log('boot', this.bootError);
      return;
    }
    try {
      this.policy = (await this.avvio.policy()).body;
      const threshold = this.policy.approvals?.thresholdUsd ?? null;
      this.log.log('boot', `policy: mode ${this.policy.mode}, developer ${this.policy.features.includes('developer') ? 'on' : 'OFF'}, approvals.thresholdUsd ${JSON.stringify(threshold)}`);
      if (threshold !== null) this.log.log('boot', 'note: payouts above the approval threshold will wait for a human in the dashboard');
      if (this.policy.mode === 'live') this.log.log('boot', 'WARNING: this is a LIVE key; payouts will pay real money');
    } catch (e) {
      this.bootError = `cannot reach Avvio: ${e instanceof Error ? e.message : String(e)}${hint(e)}`;
      this.log.log('boot', this.bootError);
      return;
    }
    if (this.policy.mode === 'test') await this.topUp();
    if (!this.config.webhookSecret) this.log.log('boot', 'no AVVIO_WEBHOOK_SECRET; running on polling and the events feed only');
  }

  /**
   * Sandbox only: make sure there is test money before the first payout, so a
   * fresh clone works without pressing anything. Funding is idempotent per
   * key; a new key per boot is fine because it only runs when the balance is low.
   */
  private async topUp(): Promise<void> {
    try {
      const balance = Number((await this.avvio.balance()).body.amount);
      if (balance >= MIN_SANDBOX_BALANCE) return;
      const r = await this.avvio.fundSandbox(TOP_UP, randomUUID());
      this.log.log('boot', `sandbox balance was $${balance.toFixed(2)}; added $${TOP_UP} of test money (now ${r.body.balance})`);
    } catch (e) {
      this.log.log('boot', `sandbox top-up skipped: ${e instanceof Error ? e.message : String(e)}. Press "Fund sandbox" in the console instead.`);
    }
  }
}

// ponytail: covers every payee's full available balance (~$1,041) with room to spare.
const MIN_SANDBOX_BALANCE = 1500;
const TOP_UP = '2000.00';

/** What to do about the usual first-run mistakes. */
function hint(e: unknown): string {
  if (!(e instanceof AvvioError)) return '';
  if (e.status === 401) return '. The API key is wrong or revoked: create a new one on the Developer page with the org menu on "Sandbox", and paste it into .env with no spaces.';
  if (e.status === 403) return '. The key needs Transact permission, and AVVIO_ORG_ID must be the organization the key was created in.';
  if (e.status === 404) return '. Check AVVIO_ORG_ID: copy it from the Developer page header.';
  return '';
}
