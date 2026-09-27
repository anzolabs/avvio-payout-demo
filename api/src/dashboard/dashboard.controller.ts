import { BadRequestException, Controller, ForbiddenException, Get, HttpException, Inject, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { visitorOf } from '../visitor';
import { SANDBOX_ACCOUNTS } from '../sandbox-accounts';
import { randomUUID } from 'node:crypto';
import { AvvioClient } from '../avvio/avvio.client';
import { AvvioError } from '../avvio/avvio.error';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { PayeesService } from '../payees/payees.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
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
    private readonly withdrawals: WithdrawalsService,
    private readonly corridor: CorridorService,
    private readonly policy: PolicyService,
  ) {}

  @Get('state')
  state(@Req() req: Request) {
    const p = this.policy.policy;
    return {
      publicDemo: this.config.publicDemo,
      configured: this.config.avvio.configured,
      mode: this.config.avvio.mode,
      orgId: this.config.avvio.org,
      baseUrl: this.config.avvio.base,
      currency: this.config.currency,
      currencies: this.config.currencies,
      // Test accounts per currency, for the app's tray. Sandbox only.
      sandboxAccounts: this.config.avvio.mode === 'test' ? Object.fromEntries(this.config.currencies.map((c) => [c, SANDBOX_ACCOUNTS[c] ?? []])) : {},
      webhookConfigured: Boolean(this.config.webhookSecret),
      policy: p && {
        mode: p.mode,
        features: p.features,
        thresholdUsd: p.approvals?.thresholdUsd ?? null,
        maxSinglePayoutUsd: p.limits?.maxSinglePayoutUsd ?? null,
      },
      bootError: this.policy.bootError,
      // `left` is what the backend will actually allow: available minus what
      // is already on its way or paid. The app shows and validates against it.
      payees: this.payees.all(visitorOf(req)).map((p) => ({ ...p, left: (this.withdrawals.leftCents(p.id, p.available) / 100).toFixed(2) })),
    };
  }

  /** The bank form: fields come from the corridor, never from the app. */
  @Get('corridor')
  corridorDefinition(@Query('currency') currency?: string) {
    return this.passthrough(() => this.corridor.current(this.currency(currency)));
  }

  /** An estimate for the confirm screen. The binding price is on the payout. */
  @Get('quote')
  quote(@Query('amount') amount: string, @Query('currency') currency?: string) {
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount ?? '')) throw new BadRequestException('amount must be a USD decimal string');
    const to = this.currency(currency);
    return this.passthrough(() => this.avvio.rates(amount, to));
  }

  /** One of the currencies this app offers; the default when none is named. */
  private currency(currency?: string): string {
    if (!currency) return this.config.currency;
    const c = currency.toUpperCase();
    if (!this.config.currencies.includes(c)) throw new BadRequestException(`currency must be one of ${this.config.currencies.join(', ')}`);
    return c;
  }

  @Get('log')
  logSince(@Req() req: Request, @Query('after') after?: string) {
    return this.log.since(after ?? '', visitorOf(req));
  }

  @Get('balance')
  balance() {
    return this.passthrough(async () => (await this.avvio.balance()).body);
  }

  @Post('sandbox/fund')
  fund() {
    if (this.config.avvio.mode === 'live') throw new BadRequestException('sandbox only');
    if (this.config.publicDemo) throw new ForbiddenException('the hosted demo tops itself up');
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
