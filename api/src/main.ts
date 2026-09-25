import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  // rawBody: webhook signatures are verified over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
  new Logger('demo').log(`Avvio payouts demo: http://localhost:${config.port}  (webhook receiver at POST /webhooks/avvio)`);
}

void bootstrap();
