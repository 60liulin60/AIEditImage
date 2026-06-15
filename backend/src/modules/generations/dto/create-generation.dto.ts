import { Provider } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

const ALLOWED_GENERATION_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const;

export class CreateGenerationDto {
  @IsEnum(Provider)
  provider!: Provider;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  model!: string;

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsIn(ALLOWED_GENERATION_SIZES)
  size?: string;
}
