import { Injectable, Logger } from '@nestjs/common';
import { StateRepository } from './state.repository';
import { LogLine } from './state.types';
import { visitorOfId } from '../visitor';

// Shared by every visitor in the hosted demo, so it keeps more.
const MAX_LOG = 2000;

/** What the backend did, kept for the console panel and echoed to stdout. */
@Injectable()
export class LogService {
  private readonly logger = new Logger('demo');

  constructor(private readonly repo: StateRepository) {}

  log(source: LogLine['source'], message: string, extra?: Record<string, unknown>): void {
    const vid = visitorOfId(message);
    const line: LogLine = { at: new Date().toISOString(), source, message, ...(extra ? { extra } : {}), ...(vid ? { vid } : {}) };
    const log = this.repo.state.log;
    log.push(line);
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    this.logger.log(`[${source}] ${message}`);
    this.repo.save();
  }

  /** Lines about no one in particular, plus this visitor's own. */
  since(after: string, vid = ''): LogLine[] {
    return this.repo.state.log.filter((l) => l.at > after && (!l.vid || l.vid === vid));
  }
}
