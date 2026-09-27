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
  private readonly cache = new Map<string, { at: number; corridor: Corridor }>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly log: LogService,
  ) {}

  async current(currency = this.config.currency): Promise<Corridor> {
    const hit = this.cache.get(currency);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.corridor;
    const res = await this.avvio.corridors(currency);
    const corridor = res.corridors.find((c) => c.currency === currency);
    if (!corridor) throw new BadGatewayException(`no ${currency} corridor for this organization`);
    this.cache.set(currency, { at: Date.now(), corridor });
    this.log.log('api', `GET /corridors → ${corridor.currency}: ${corridor.fields.map((f) => f.id).join(', ')}`);
    return corridor;
  }
}
