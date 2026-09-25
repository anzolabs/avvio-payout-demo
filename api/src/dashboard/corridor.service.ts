import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { AvvioClient } from '../avvio/avvio.client';
import { Corridor } from '../avvio/avvio.types';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';

const TTL_MS = 60 * 60 * 1000;

/**
 * The form definition the app renders, read from Avvio and cached for an hour.
 * Fields are never hardcoded: they depend on how the organization is routed.
 */
@Injectable()
export class CorridorService {
  private cache: { at: number; corridor: Corridor } | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly log: LogService,
  ) {}

  async current(): Promise<Corridor> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.corridor;
    const res = await this.avvio.corridors(this.config.currency);
    const corridor = res.corridors.find((c) => c.currency === this.config.currency);
    if (!corridor) throw new BadGatewayException(`no ${this.config.currency} corridor for this organization`);
    this.cache = { at: Date.now(), corridor };
    this.log.log('api', `GET /corridors → ${corridor.currency}: ${corridor.fields.map((f) => f.id).join(', ')}`);
    return corridor;
  }
}
