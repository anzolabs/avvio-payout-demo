import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

// ponytail: the API's list, copied; the API refuses anything else anyway.
export const PURPOSES = ['FAMILY_SUPPORT', 'GIFT', 'SELF', 'EDUCATION', 'HEALTH_OR_MEDICAL', 'UTILITY_BILL', 'LOAN_PAYMENT', 'GOODS_OR_SERVICES', 'SALARY_PAYMENT', 'REAL_ESTATE_PURCHASE', 'TAX_PAYMENT', 'DONATION', 'TRAVEL', 'OTHER'];

export class CreateWithdrawalDto {
  @IsString()
  payeeId!: string;

  /** USD, a decimal string with at most two fractional digits. Never a number. */
  @Matches(/^(?=.*[1-9])\d{1,6}(\.\d{1,2})?$/, { message: 'amount must be a USD decimal string above zero' })
  amount!: string;

  /** One of the payee's saved accounts, from GET /api/payees/:id/accounts. */
  @IsString()
  destinationAccountId!: string;

  /** The app's id for this tap. The same id twice returns the same withdrawal. */
  @IsUUID()
  requestId!: string;

  /** The destination amount the payee was shown, as a decimal string. */
  @IsOptional()
  // The same rule the API applies: up to six decimals (a quote's destination
  // amount is not always rounded to two).
  @Matches(/^\d{1,15}(\.\d{1,6})?$/, { message: 'expectDestination must be a decimal string' })
  expectDestination?: string;

  /** Why the money is sent. Required in some corridors (INR, BRL, …); defaults by recipient. */
  @IsOptional()
  @IsIn(PURPOSES)
  purposeOfPayment?: string;
}
