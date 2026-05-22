import cookieParser = require('cookie-parser');
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function parseConfiguredOrigins(value?: string): string[] {
  // FRONTEND_ORIGIN 支持逗号分隔，便于部署时显式限制多个前端域名。
  return value
    ? value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];
}

function isLocalDevOrigin(origin: string): boolean {
  // 前端端口可能被 Vite 自动更换，只允许本机开发域名动态放行。
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const configuredOrigins = parseConfiguredOrigins(configService.get<string>('FRONTEND_ORIGIN'));

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin(origin, callback) {
      // 无 Origin 的请求通常来自 curl、服务端脚本或同源访问，直接允许。
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed =
        configuredOrigins.length > 0 ? configuredOrigins.includes(origin) : isLocalDevOrigin(origin);
      callback(isAllowed ? null : new Error('CORS origin is not allowed'), isAllowed);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 后端默认固定 3033，仍允许通过 PORT 在部署环境覆盖。
  const port = Number(configService.get<string>('PORT') ?? 3033);
  await app.listen(port);
}

void bootstrap();
