import { IsObject, IsUUID } from 'class-validator';

export class AddAccountDto {
  /** Keyed by the corridor's field ids, exactly as `GET /api/corridor` listed them. */
  @IsObject()
  details!: Record<string, string>;

  /**
   * The app's id for this submission, used as the Idempotency-Key. The app
   * keeps it while the form is unchanged, so resubmitting after a timeout
   * registers the account once; editing the form mints a new one.
   */
  @IsUUID()
  requestId!: string;
}
