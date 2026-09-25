import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PayeesController } from './payees.controller';
import { PayeesService } from './payees.service';

@Module({
  controllers: [PayeesController],
  providers: [PayeesService, AccountsService],
  exports: [PayeesService, AccountsService],
})
export class PayeesModule {}
