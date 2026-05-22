import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AUTH_COOKIE_NAME } from '../../common/auth.constants';
import type { AuthenticatedUser } from '../../common/types';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthenticatedUser['role'];
}

function cookieExtractor(request: { cookies?: Record<string, string> } | undefined): string | null {
  // Cookie 优先，Authorization 头只作为测试和脚本调用的兼容入口。
  return request?.cookies?.[AUTH_COOKIE_NAME] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-only-change-me',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // 数据库重建、用户删除或禁用后，旧 JWT 不能继续作为有效身份使用。
    if (!user?.isActive) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
