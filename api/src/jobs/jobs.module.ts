import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { FastPollJob } from './fast-poll.job';
import { ReconcileJob } from './reconcile.job';

@Module({
  imports: [ScheduleModule.forRoot(), WithdrawalsModule],
  providers: [FastPollJob, ReconcileJob],
})
export class JobsModule {}
