import { GenerationStatus, Provider } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

function normalizeOptionalEnumQuery(value: unknown) {
  // clearable 筛选或手写 URL 会传入空字符串；转成 undefined 后让 IsOptional 跳过枚举校验。
  return value === '' ? undefined : value;
}

export class ListGenerationsDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize = 12;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalEnumQuery(value))
  @IsEnum(Provider)
  provider?: Provider;

  @IsOptional()
  @Transform(({ value }) => normalizeOptionalEnumQuery(value))
  @IsEnum(GenerationStatus)
  status?: GenerationStatus;
}
