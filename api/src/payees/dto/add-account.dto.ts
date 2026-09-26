import { IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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

  /**
   * Who is being paid, when it is not the payee themselves: each person is
   * their own beneficiary at Avvio, named as their bank knows them.
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[\p{L}][\p{L} .'-]*$/u, { message: 'holderName must be a name' })
  holderName?: string;
}
