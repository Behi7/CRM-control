import { IsEmail, IsString, MinLength, IsIn, IsOptional, IsDate, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';
export class CreateAccountDto {
  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsString() @Matches(/^[a-z0-9-]+$/i)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  subdomain!: string;
  @IsString() @MinLength(1) token!: string;
  @IsOptional() @Type(() => Date) @IsDate() tokenExpiresAt?: Date;
  @IsIn(['amocrm.ru','kommo.com']) baseDomain!: 'amocrm.ru' | 'kommo.com';
}
