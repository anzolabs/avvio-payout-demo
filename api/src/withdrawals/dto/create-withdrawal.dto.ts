import { IsString, Matches } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  payeeId!: string;

  /** USD, a decimal string with at most two fractional digits. Never a number. */
  @Matches(/^\d{1,6}(\.\d{1,2})?$/, { message: 'amount must be a USD decimal string' })
  amount!: string;

  /** One of the payee's saved accounts, from GET /api/payees/:id/accounts. */
  @IsString()
  destinationAccountId!: string;
}
