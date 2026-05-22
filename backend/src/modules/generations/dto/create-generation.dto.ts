import { Provider } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

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
  prompt!: string;

  @IsOptional()
  @IsString()
  size?: string;
}
