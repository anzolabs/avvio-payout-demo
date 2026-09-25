import { IsObject } from 'class-validator';

export class AddAccountDto {
  /** Keyed by the corridor's field ids, exactly as `GET /api/corridor` listed them. */
  @IsObject()
  details!: Record<string, string>;
}
