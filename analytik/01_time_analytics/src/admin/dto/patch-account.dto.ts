import { IsEmail, IsString, MinLength, IsOptional, IsDate } from 'class-validator';
import { Transform, Type } from 'class-transformer';
export class PatchAccountDto {
  @IsOptional() @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;
  @IsOptional() @IsString() @MinLength(12) password?: string;
  @IsOptional() @IsString() @MinLength(1) token?: string;
  @IsOptional() @Type(() => Date) @IsDate() tokenExpiresAt?: Date;
}
