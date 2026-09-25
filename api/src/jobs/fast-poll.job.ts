import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AvvioClient } from '../avvio/avvio.client';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { applyApproval, applyPayout, OPEN_STATUSES } from '../withdrawals/withdrawal-status';

const WINDOW_MS = 20 * 60 * 1000; // stop polling withdrawals older than this

/**
 * While a payee is looking at the screen, ask about the payout every few
 * seconds so the app updates the moment something happens. Webhooks arrive
 * within about 15 seconds; this covers the impatient case and a run without a
 * public webhook URL.
 */
@Injectable()
export class FastPollJob {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly repo: StateRepository,
    private readonly log: LogService,
  ) {}

  @Interval(5000)
  async run(): Promise<void> {
    if (!this.config.avvio.configured) return;
    const cutoff = Date.now() - WINDOW_MS;
    const open = Object.values(this.repo.state.withdrawals).filter((w) => OPEN_STATUSES.includes(w.status) && Date.parse(w.createdAt) > cutoff);
    for (const wd of open) {
      try {
        if (wd.status === 'awaiting_approval' && wd.approvalId) {
          const approval = await this.avvio.approval(wd.approvalId);
          if (applyApproval(wd, approval, 'poll')) {
            this.repo.save();
            this.log.log('poll', `GET /payouts/approvals/${wd.approvalId} → ${approval.status}, ${wd.id} now ${wd.status}`);
          }
          continue;
        }
        const p = wd.payoutId ? await this.avvio.payout(wd.payoutId) : await this.avvio.payoutByReference(wd.reference);
        if (p && applyPayout(wd, p, 'poll')) {
          this.repo.save();
          this.log.log('poll', `GET /orders/${p.payoutId} → ${p.status}, ${wd.id} now ${wd.status}`);
        }
      } catch (e) {
        this.log.log('poll', `poll failed for ${wd.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
