import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AvvioClient } from '../avvio/avvio.client';
import { APP_CONFIG, AppConfig } from '../config/app.config';
import { LogService } from '../store/log.service';
import { StateRepository } from '../store/state.repository';
import { EventsService } from '../withdrawals/events.service';

const MAX_PAGES = 20;

/**
 * The guarantee. Webhooks are the fast path; the feed is what the books are
 * reconciled from. The cursor is persisted, so a restart continues where it
 * left off, and every event id is remembered so nothing is applied twice.
 */
@Injectable()
export class ReconcileJob implements OnApplicationBootstrap {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly avvio: AvvioClient,
    private readonly repo: StateRepository,
    private readonly log: LogService,
    private readonly events: EventsService,
  ) {}

  private running = false;

  onApplicationBootstrap(): void {
    void this.run();
  }

  @Interval(30000)
  async run(): Promise<void> {
    if (!this.config.avvio.configured || this.running) return;
    this.running = true;
    let since = this.repo.state.eventsCursor;
    let applied = 0;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const feed = await this.avvio.events(since);
        for (const ev of feed.data ?? []) {
          if (this.repo.hasSeen(ev.id)) continue;
          try {
            this.events.apply(ev, 'feed');
            // Only after it was applied: an event that failed is not "seen".
            this.repo.markSeen(ev.id);
            applied++;
          } catch (e) {
            // One bad row must not stall the feed. Log it loudly with its id;
            // the cursor still moves on, so this is where you would alert.
            this.log.log('feed', `could not apply ${ev.type} ${ev.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        since = feed.nextSince ?? since;
        // Persist the cursor page by page so a crash mid-backlog resumes here.
        this.repo.state.eventsCursor = since;
        this.repo.save();
        if (!feed.hasMore) break;
      }
      if (applied) this.log.log('feed', `applied ${applied} new event(s); cursor ${since}`);
    } catch (e) {
      this.log.log('feed', `GET /events failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = false;
    }
  }
}
