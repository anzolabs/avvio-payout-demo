import { Injectable } from '@nestjs/common';
import { ApprovalEventData, PayoutEvent, WebhookPayout } from '../avvio/avvio.types';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { TimelineEntry, Withdrawal } from '../store/state.types';
import { applyApproval, applyPayout } from './withdrawal-status';

/**
 * One entry point for every event, whether it arrived as a webhook or was read
 * from the feed. Payout events match by OUR reference first, then by payoutId;
 * approval events match by approvalId.
 */
@Injectable()
export class EventsService {
  constructor(private readonly repo: StateRepository, private readonly log: LogService) {}

  apply(event: PayoutEvent, source: TimelineEntry['source']): void {
    if (!event || typeof event.type !== 'string') return;

    if (event.type.startsWith('payout_approval.')) {
      const data = event.data as ApprovalEventData;
      const wd = this.find({ approvalId: data.approval?.id });
      if (!wd) return this.log.log(source, `${event.type} for an approval that is not ours`);
      const changed = applyApproval(wd, { ...data.approval, payoutId: data.payoutId ?? data.approval.payoutId }, source);
      this.repo.save();
      return this.log.log(source, `${event.type} seq ${event.sequence ?? '?'} → ${wd.id} ${changed ? 'now ' + wd.status : 'no change'}`);
    }

    if (!event.type.startsWith('payout.')) return this.log.log(source, `ignored ${event.type} (informational)`);

    const data = event.data as WebhookPayout;
    const wd = this.find({ reference: data.reference ?? undefined, payoutId: data.payoutId });
    if (!wd) return this.log.log(source, `${event.type} for a payout that is not ours (reference ${data.reference ?? 'none'})`);
    const changed = applyPayout(wd, data, source, event.type);
    this.repo.save();
    this.log.log(source, `${event.type} seq ${event.sequence ?? '?'} → ${wd.id} ${changed ? 'now ' + wd.status : 'no change'}`, { payoutId: data.payoutId, livemode: event.livemode });
  }

  private find(by: { reference?: string; payoutId?: string; approvalId?: string }): Withdrawal | undefined {
    return Object.values(this.repo.state.withdrawals).find(
      (w) => (by.reference && w.reference === by.reference) || (by.payoutId && w.payoutId === by.payoutId) || (by.approvalId && w.approvalId === by.approvalId),
    );
  }
}
