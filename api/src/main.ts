import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app.config';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORWARDING_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

/**
 * This demo has no login, so only this machine may use the app and its
 * /api routes. The one path a tunnel may reach is the webhook receiver, which
 * authenticates every delivery by its signature. Requests through a tunnel
 * carry the tunnel's hostname and forwarding headers, so they are refused
 * everywhere else. The Host check also stops DNS rebinding.
 */
function localOnlyExceptWebhooks(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/webhooks/')) return next();
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  // Tunnels and proxies add these; a request typed into this machine's browser
  // never has them. Checked as well as Host, in case a tunnel rewrites Host.
  const proxied = FORWARDING_HEADERS.some((h) => req.headers[h] !== undefined);
  if (LOCAL_HOSTS.has(host) && !proxied) return next();
  res.status(403).json({ message: 'This demo only serves /webhooks/* to other hosts. Open it on http://localhost.' });
}

/**
 * Mutations on /api accept JSON only. A browser cannot send JSON to another
 * origin without a CORS preflight, which this server never grants, so a
 * malicious page cannot make your browser fund or pay through the demo.
 */
function jsonOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.path.startsWith('/api/')) return next();
  if ((req.headers['content-type'] ?? '').split(';')[0].trim() === 'application/json') return next();
  res.status(415).json({ message: 'application/json only' });
}

async function bootstrap(): Promise<void> {
  // rawBody: webhook signatures are verified over the exact bytes received.
  // bodyParser off, then JSON only: no urlencoded form posts.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false });
  app.use(localOnlyExceptWebhooks, jsonOnly);
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port, config.host);
  new Logger('demo').log(`Avvio payouts demo: http://localhost:${config.port}  (webhook receiver at POST /webhooks/avvio)`);
}

void bootstrap();
