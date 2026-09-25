import { Injectable } from '@nestjs/common';

/** Someone the business pays: a contractor, a seller, a worker. */
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
    { id: 'payee_4471', name: 'Ana Lopez', email: 'ana.lopez@example.com', available: '312.50', note: 'Earned this week · pays out any time' },
    { id: 'payee_4472', name: 'Luis Ortega', email: 'luis.ortega@example.com', available: '188.00', note: 'Invoice #1042 approved' },
    { id: 'payee_4473', name: 'Maria Chen', email: 'maria.chen@example.com', available: '540.25', note: 'Marketplace sales, settled' },
  ];

  all(): Payee[] {
    return this.payees;
  }

  byId(id: string): Payee | undefined {
    return this.payees.find((p) => p.id === id);
  }
}
