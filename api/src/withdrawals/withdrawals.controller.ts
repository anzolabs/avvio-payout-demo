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

  /** 201 when the payout was sent or held; 502 carries a withdrawal in `error` state. */
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateWithdrawalDto, @Res({ passthrough: true }) res: Response) {
    const wd = await this.withdrawals.create(dto.payeeId, dto.amount, dto.destinationAccountId);
    if (wd.status === 'error') res.status(502);
    return toView(wd);
  }
}
