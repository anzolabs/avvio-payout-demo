import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AddAccountDto } from './dto/add-account.dto';

@Controller('api/payees')
export class PayeesController {
  constructor(private readonly accounts: AccountsService) {}

  /** The payee's saved accounts, masked. */
  @Get(':payeeId/accounts')
  list(@Param('payeeId') payeeId: string) {
    return { accounts: this.accounts.list(payeeId) };
  }

  @Post(':payeeId/accounts')
  async add(@Param('payeeId') payeeId: string, @Body() dto: AddAccountDto) {
    return { account: await this.accounts.add(payeeId, dto.details, dto.requestId) };
  }

  @Delete(':payeeId/accounts/:methodId')
  async remove(@Param('payeeId') payeeId: string, @Param('methodId') methodId: string) {
    return { accounts: await this.accounts.remove(payeeId, methodId) };
  }
}
