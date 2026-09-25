import { Module } from '@nestjs/common';
import { PayeesModule } from '../payees/payees.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { CorridorService } from './corridor.service';
import { DashboardController } from './dashboard.controller';
import { PolicyService } from './policy.service';

@Module({
  imports: [PayeesModule, WithdrawalsModule],
  controllers: [DashboardController],
  providers: [CorridorService, PolicyService],
})
export class DashboardModule {}
