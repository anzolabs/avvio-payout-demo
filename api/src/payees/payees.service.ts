import { Injectable } from '@nestjs/common';
import { visitorOfId } from '../visitor';

/** A worker on the platform, sending part of their earned wages to people they choose. */
export interface Payee {
  id: string;
  name: string;
  email: string;
  /** What they can withdraw right now, USD. */
  available: string;
  note: string;
}

/**
 * The business's own records. A fixture here; a real app reads this from its
 * database. The payee id is the `externalId` Avvio knows them by.
 */
@Injectable()
export class PayeesService {
  private readonly payees: Payee[] = [
    { id: 'payee_4471', name: 'Ana Lopez', email: 'ana.lopez@example.com', available: '312.50', note: 'Earned wages · 4 shifts this week' },
    { id: 'payee_4472', name: 'Luis Ortega', email: 'luis.ortega@example.com', available: '188.00', note: 'Earned wages · 2 shifts this week' },
    { id: 'payee_4473', name: 'Maria Chen', email: 'maria.chen@example.com', available: '540.25', note: 'Earned wages · 6 shifts this week' },
  ];

  /** A visitor to the hosted demo gets their own copy of each payee. */
  all(vid = ''): Payee[] {
    return vid ? this.payees.map((p) => ({ ...p, id: `${p.id}-${vid}` })) : this.payees;
  }

  byId(id: string): Payee | undefined {
    const vid = visitorOfId(id);
    const base = vid ? id.slice(0, -(vid.length + 1)) : id;
    const p = this.payees.find((x) => x.id === base);
    return p && { ...p, id };
  }

  /** Whether this visitor ('' when run locally) may act for this payee. */
  owns(id: string, vid: string): boolean {
    return visitorOfId(id) === vid && this.byId(id) !== undefined;
  }
}
