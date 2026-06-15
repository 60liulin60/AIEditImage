import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_COOKIE_MAX_AGE_MS, AUTH_COOKIE_NAME } from '../../common/auth.constants';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const cookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto);

    response.cookie(AUTH_COOKIE_NAME, result.token, cookieOptions);

    return { user: result.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(AUTH_COOKIE_NAME, { path: '/', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', secure: process.env.NODE_ENV === 'production' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }
}
