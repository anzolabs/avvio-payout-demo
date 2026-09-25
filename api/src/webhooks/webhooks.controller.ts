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
    this.repo.markSeen(verified.id);
    this.log.log('webhook', `verified ${verified.event.type} (svix-id ${verified.id}, livemode ${verified.event.livemode})`);
    // Apply after this method returns so the acknowledgement is not delayed.
    setImmediate(() => this.events.apply(verified.event, 'webhook'));
    return { ok: true };
  }
}
