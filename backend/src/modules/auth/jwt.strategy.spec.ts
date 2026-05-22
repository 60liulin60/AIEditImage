import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  function createStrategy(user: unknown) {
    const configService = {
      get: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
    };

    return {
      strategy: new JwtStrategy(configService, prisma as never),
      prisma,
    };
  }

  it('rejects a token when the user no longer exists', async () => {
    const { strategy, prisma } = createStrategy(null);

    await expect(
      strategy.validate({
        sub: 'missing-user-id',
        email: 'old@example.com',
        role: UserRole.USER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'missing-user-id' },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  });

  it('returns the current database user instead of stale token fields', async () => {
    // 以数据库为准，避免旧 JWT 中的邮箱或角色和当前用户状态不一致。
    const { strategy } = createStrategy({
      id: 'user-id',
      email: 'current@example.com',
      role: UserRole.ADMIN,
      isActive: true,
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        email: 'stale@example.com',
        role: UserRole.USER,
      }),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'current@example.com',
      role: UserRole.ADMIN,
    });
  });

  it('rejects a token when the user has been disabled', async () => {
    // 被禁用的账号即使 JWT 未过期，也不能继续访问受保护接口。
    const { strategy } = createStrategy({
      id: 'user-id',
      email: 'disabled@example.com',
      role: UserRole.USER,
      isActive: false,
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        email: 'disabled@example.com',
        role: UserRole.USER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
