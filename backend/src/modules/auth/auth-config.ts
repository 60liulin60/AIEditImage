import type { ConfigService } from '@nestjs/config';

export const DEV_JWT_SECRET = 'dev-only-change-me';
export const DEFAULT_JWT_SECRET = 'please-change-this-secret';

export function getJwtSecret(configService: ConfigService) {
  const secret = configService.get<string>('JWT_SECRET');
  const nodeEnv = configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;

  if (nodeEnv === 'production') {
    if (!secret) {
      throw new Error('生产环境必须配置 JWT_SECRET');
    }
    if (secret === DEV_JWT_SECRET || secret === DEFAULT_JWT_SECRET) {
      throw new Error('生产环境不能使用默认 JWT_SECRET');
    }
  }

  return secret ?? DEV_JWT_SECRET;
}
