import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { AvvioModule } from './avvio/avvio.module';
import { loadConfig } from './config/app.config';
import { ConfigModule } from './config/config.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { JobsModule } from './jobs/jobs.module';
import { PayeesModule } from './payees/payees.module';
import { StoreModule } from './store/store.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';

const webDist = loadConfig().webDist;

@Module({
  imports: [
    ConfigModule,
    StoreModule,
    AvvioModule,
    PayeesModule,
    WithdrawalsModule,
    WebhooksModule,
    JobsModule,
    DashboardModule,
    // The built React app, when it exists. API and webhook routes take precedence.
    ...(existsSync(webDist)
      ? [ServeStaticModule.forRoot({ rootPath: webDist, exclude: ['/api/{*path}', '/webhooks/{*path}'] })]
      : []),
  ],
})
export class AppModule {}
