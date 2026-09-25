import { Module } from '@nestjs/common';
import { PayeesModule } from '../payees/payees.module';
import { EventsService } from './events.service';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';

@Module({
  imports: [PayeesModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService, EventsService],
  exports: [WithdrawalsService, EventsService],
})
export class WithdrawalsModule {}
