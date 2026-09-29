import { IsString, IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessageDto {
  @IsString()
  role!: 'user' | 'model';

  @IsString()
  text!: string;
}

export class ChatFiltersDto {
  @IsOptional()
  @IsArray()
  tagIds?: number[];

  @IsOptional()
  @IsArray()
  managerIds?: number[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @IsOptional()
  @IsNumber()
  pipelineId?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatFiltersDto)
  filters?: ChatFiltersDto;

  @IsOptional()
  @IsString()
  lang?: 'ru' | 'uz';
}

