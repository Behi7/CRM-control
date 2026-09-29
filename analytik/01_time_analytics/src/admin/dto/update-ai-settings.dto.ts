import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiModel?: string;

  @IsString()
  @IsOptional()
  aiToken?: string;

  @IsString()
  @IsOptional()
  aiCompanyContext?: string;
}

