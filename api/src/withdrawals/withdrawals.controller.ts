import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { visitorOf } from '../visitor';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { toView } from './withdrawal-status';
import { WithdrawalsService } from './withdrawals.service';

@Controller('api/withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.withdrawals.list(visitorOf(req));
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.withdrawals.get(id, visitorOf(req));
  }

  /**
   * 201 when the payout was sent or held for approval; 202 while its outcome
   * is unknown (the backend keeps resolving it); 502 when Avvio refused it.
   */
  @Post()
  @HttpCode(201)
  async create(@Req() req: Request, @Body() dto: CreateWithdrawalDto, @Res({ passthrough: true }) res: Response) {
    const wd = await this.withdrawals.create(visitorOf(req), dto.payeeId, dto.amount, dto.destinationAccountId, dto.requestId, dto.expectDestination);
    if (wd.status === 'error') res.status(502);
    else if (wd.status === 'unknown') res.status(202);
    return toView(wd);
  }
}
