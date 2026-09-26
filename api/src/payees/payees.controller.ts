import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { visitorOf } from '../visitor';
import { AccountsService } from './accounts.service';
import { AddAccountDto } from './dto/add-account.dto';
import { PayeesService } from './payees.service';

@Controller('api/payees')
export class PayeesController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly payees: PayeesService,
  ) {}

  private mine(req: Request, payeeId: string): string {
    if (!this.payees.owns(payeeId, visitorOf(req))) throw new NotFoundException('unknown payee');
    return payeeId;
  }

  /** The payee's saved accounts, masked. */
  @Get(':payeeId/accounts')
  list(@Req() req: Request, @Param('payeeId') payeeId: string) {
    return { accounts: this.accounts.list(this.mine(req, payeeId)) };
  }

  @Post(':payeeId/accounts')
  async add(@Req() req: Request, @Param('payeeId') payeeId: string, @Body() dto: AddAccountDto) {
    return { account: await this.accounts.add(this.mine(req, payeeId), dto.details, dto.requestId) };
  }

  @Delete(':payeeId/accounts/:methodId')
  async remove(@Req() req: Request, @Param('payeeId') payeeId: string, @Param('methodId') methodId: string) {
    return { accounts: await this.accounts.remove(this.mine(req, payeeId), methodId) };
  }
}
