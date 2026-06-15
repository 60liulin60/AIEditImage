import type { ConfigService } from '@nestjs/config';
import { getJwtSecret, DEV_JWT_SECRET, DEFAULT_JWT_SECRET } from './auth-config';

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('auth-config', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('uses the dev fallback when JWT_SECRET is missing outside production', () => {
    process.env.NODE_ENV = 'development';

    expect(getJwtSecret(createConfigService({ JWT_SECRET: undefined, NODE_ENV: 'development' }))).toBe(DEV_JWT_SECRET);
  });

  it('rejects missing JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => getJwtSecret(createConfigService({ JWT_SECRET: undefined, NODE_ENV: 'production' }))).toThrow('生产环境必须配置 JWT_SECRET');
  });

  it('rejects default JWT_SECRET values in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => getJwtSecret(createConfigService({ JWT_SECRET: DEV_JWT_SECRET, NODE_ENV: 'production' }))).toThrow(
      '生产环境不能使用默认 JWT_SECRET',
    );
    expect(() => getJwtSecret(createConfigService({ JWT_SECRET: DEFAULT_JWT_SECRET, NODE_ENV: 'production' }))).toThrow(
      '生产环境不能使用默认 JWT_SECRET',
    );
  });

  it('uses the configured production secret', () => {
    process.env.NODE_ENV = 'production';

    expect(getJwtSecret(createConfigService({ JWT_SECRET: 'prod-secret', NODE_ENV: 'production' }))).toBe('prod-secret');
  });
});
