import { BadRequestException, Controller, HttpCode, Inject, Post, RawBodyRequest, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { PayoutEvent } from '../avvio/avvio.types';
import { WebhookVerifier } from '../avvio/webhook-verifier';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { EventsService } from '../withdrawals/events.service';

/**
 * POST /webhooks/avvio. Raw bytes first, verify, dedupe, acknowledge, then
 * apply. A 2xx goes out only for deliveries we could verify.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly verifier: WebhookVerifier,
    private readonly repo: StateRepository,
    private readonly log: LogService,
    private readonly events: EventsService,
  ) {}

  @Post('avvio')
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>) {
    if (!this.config.webhookSecret) {
      this.log.log('webhook', 'delivery received but AVVIO_WEBHOOK_SECRET is not set; answered 503');
      throw new ServiceUnavailableException('webhook secret not configured');
    }
    let verified;
    try {
      verified = this.verifier.verify<PayoutEvent>({ rawBody: req.rawBody ?? Buffer.alloc(0), headers: req.headers, secret: this.config.webhookSecret });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.log.log('webhook', `rejected: ${message}`);
      throw new BadRequestException(message);
    }
    if (this.repo.hasSeen(verified.id)) {
      this.log.log('webhook', `duplicate ${verified.id}, acknowledged again`);
      return { ok: true, duplicate: true };
    }
    this.log.log('webhook', `verified ${verified.event.type} (svix-id ${verified.id}, livemode ${verified.event.livemode})`);
    // Acknowledge now, apply right after. The id is remembered only once the
    // event was applied: if applying fails, the events feed delivers the same
    // id again and the reconciler applies it then. Nothing is lost, and
    // applying twice is harmless because statuses only move forward.
    setImmediate(() => {
      try {
        this.events.apply(verified.event, 'webhook');
        this.repo.markSeen(verified.id);
        this.repo.save();
      } catch (e) {
        this.log.log('webhook', `could not apply ${verified.id}: ${e instanceof Error ? e.message : String(e)}; the feed will retry it`);
      }
    });
    return { ok: true };
  }
}
