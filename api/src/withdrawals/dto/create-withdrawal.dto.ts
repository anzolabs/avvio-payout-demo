import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  payeeId!: string;

  /** USD, a decimal string with at most two fractional digits. Never a number. */
  @Matches(/^\d{1,6}(\.\d{1,2})?$/, { message: 'amount must be a USD decimal string' })
  amount!: string;

  /** One of the payee's saved accounts, from GET /api/payees/:id/accounts. */
  @IsString()
  destinationAccountId!: string;

  /** The app's id for this tap. The same id twice returns the same withdrawal. */
  @IsUUID()
  requestId!: string;

  /** The destination amount the payee was shown, as a decimal string. */
  @IsOptional()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/, { message: 'expectDestination must be a decimal string' })
  expectDestination?: string;
}
