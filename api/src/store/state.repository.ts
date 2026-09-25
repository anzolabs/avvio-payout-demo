import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { emptyState, State } from './state.types';

const MAX_SEEN = 5000;

/**
 * One JSON file. Enough for a demo, and it survives a restart, which matters:
 * an Idempotency-Key that lives only in memory is lost on the crash that makes
 * you retry. Swap this class for a database without touching anything else.
 */
@Injectable()
export class StateRepository implements OnModuleInit {
  readonly state: State = emptyState();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onModuleInit(): void {
    try {
      Object.assign(this.state, JSON.parse(readFileSync(this.config.dataFile, 'utf8')));
    } catch {
      // first run
    }
  }

  save(): void {
    mkdirSync(dirname(this.config.dataFile), { recursive: true });
    const tmp = this.config.dataFile + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.config.dataFile);
  }

  hasSeen(eventId: string): boolean {
    return this.state.seenEvents.includes(eventId);
  }

  markSeen(eventId: string): void {
    this.state.seenEvents.push(eventId);
    if (this.state.seenEvents.length > MAX_SEEN) this.state.seenEvents.splice(0, this.state.seenEvents.length - MAX_SEEN);
  }
}
