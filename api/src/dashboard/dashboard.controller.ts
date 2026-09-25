import { BadRequestException, Controller, Get, HttpException, Inject, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError } from '../avvio/avvio.error';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { PayeesService } from '../payees/payees.service';
import { LogService } from '../store/log.service';
import { CorridorService } from './corridor.service';
import { PolicyService } from './policy.service';

/** What the app and the console panel read that is not a payee or a withdrawal. */
@Controller('api')
export class DashboardController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly log: LogService,
    private readonly payees: PayeesService,
    private readonly corridor: CorridorService,
    private readonly policy: PolicyService,
  ) {}

  @Get('state')
  state() {
    const p = this.policy.policy;
    return {
      configured: this.config.avvio.configured,
      mode: this.config.avvio.mode,
      orgId: this.config.avvio.org,
      baseUrl: this.config.avvio.base,
      currency: this.config.currency,
      webhookConfigured: Boolean(this.config.webhookSecret),
      policy: p && {
        mode: p.mode,
        features: p.features,
        thresholdUsd: p.approvals?.thresholdUsd ?? null,
        maxSinglePayoutUsd: p.limits?.maxSinglePayoutUsd ?? null,
      },
      bootError: this.policy.bootError,
      payees: this.payees.all(),
    };
  }

  /** The bank form: fields come from the corridor, never from the app. */
  @Get('corridor')
  corridorDefinition() {
    return this.passthrough(() => this.corridor.current());
  }

  /** An estimate for the confirm screen. The binding price is on the payout. */
  @Get('quote')
  quote(@Query('amount') amount: string) {
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount ?? '')) throw new BadRequestException('amount must be a USD decimal string');
    return this.passthrough(() => this.avvio.rates(amount, this.config.currency));
  }

  @Get('log')
  logSince(@Query('after') after?: string) {
    return this.log.since(after ?? '');
  }

  @Get('balance')
  balance() {
    return this.passthrough(async () => (await this.avvio.balance()).body);
  }

  @Post('sandbox/fund')
  fund() {
    if (this.config.avvio.mode === 'live') throw new BadRequestException('sandbox only');
    return this.passthrough(async () => {
      const r = await this.avvio.fundSandbox('1000.00', randomUUID());
      this.log.log('api', `POST /sandbox/fund → balance ${r.body.balance}`);
      return r.body;
    });
  }

  /** Surface Avvio's own status and error type rather than a generic 500. */
  private async passthrough<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AvvioError) throw new HttpException({ message: e.message, type: e.type, errors: e.errors }, e.status);
      throw e;
    }
  }
}
