import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AvvioClient } from '../avvio/avvio.client';
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
      this.log.log('boot', `policy: mode ${this.policy.mode}, features ${JSON.stringify(this.policy.features)}, approvals.thresholdUsd ${JSON.stringify(threshold)}`);
      if (threshold !== null) this.log.log('boot', 'note: payouts above the approval threshold will wait for a human in the dashboard');
      if (this.policy.mode === 'live') this.log.log('boot', 'WARNING: this is a LIVE key; payouts will pay real money');
    } catch (e) {
      this.bootError = `policy read failed: ${e instanceof Error ? e.message : String(e)}`;
      this.log.log('boot', this.bootError);
    }
    if (!this.config.webhookSecret) this.log.log('boot', 'no AVVIO_WEBHOOK_SECRET; running on polling and the events feed only');
  }
}
