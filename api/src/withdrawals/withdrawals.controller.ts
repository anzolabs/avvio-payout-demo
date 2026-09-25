import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { toView } from './withdrawal-status';
import { WithdrawalsService } from './withdrawals.service';

@Controller('api/withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawals: WithdrawalsService) {}

  @Get()
  list() {
    return this.withdrawals.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.withdrawals.get(id);
  }

  /**
   * 201 when the payout was sent or held for approval; 202 while its outcome
   * is unknown (the backend keeps resolving it); 502 when Avvio refused it.
   */
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateWithdrawalDto, @Res({ passthrough: true }) res: Response) {
    const wd = await this.withdrawals.create(dto.payeeId, dto.amount, dto.destinationAccountId, dto.requestId, dto.expectDestination);
    if (wd.status === 'error') res.status(502);
    else if (wd.status === 'unknown') res.status(202);
    return toView(wd);
  }
}
