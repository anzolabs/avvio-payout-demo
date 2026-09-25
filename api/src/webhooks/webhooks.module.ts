import { Module } from '@nestjs/common';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [WithdrawalsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
