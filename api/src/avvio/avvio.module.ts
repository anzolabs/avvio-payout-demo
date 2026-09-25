import { Global, Module } from '@nestjs/common';
import { AvvioClient } from './avvio.client';
import { WebhookVerifier } from './webhook-verifier';

@Global()
@Module({
  providers: [AvvioClient, WebhookVerifier],
  exports: [AvvioClient, WebhookVerifier],
})
export class AvvioModule {}
