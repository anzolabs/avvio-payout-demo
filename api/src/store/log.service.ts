import { Injectable, Logger } from '@nestjs/common';
import { StateRepository } from './state.repository';
import { LogLine } from './state.types';

const MAX_LOG = 300;

/** What the backend did, kept for the console panel and echoed to stdout. */
@Injectable()
export class LogService {
  private readonly logger = new Logger('demo');

  constructor(private readonly repo: StateRepository) {}

  log(source: LogLine['source'], message: string, extra?: Record<string, unknown>): void {
    const line: LogLine = { at: new Date().toISOString(), source, message, ...(extra ? { extra } : {}) };
    const log = this.repo.state.log;
    log.push(line);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    this.logger.log(`[${source}] ${message}`);
    this.repo.save();
  }

  since(after: string): LogLine[] {
    return this.repo.state.log.filter((l) => l.at > after);
  }
}
