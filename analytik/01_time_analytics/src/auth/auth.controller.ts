import { Controller, Post, Body, Req, Res, HttpCode, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.email, dto.password);
    this.setCookie(req, res, r.refreshToken);
    return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: r.role };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token || body?.refreshToken;
    const r = await this.auth.refresh(token);
    if (!r) {
      res.clearCookie('refresh_token', this.opts(req));
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    this.setCookie(req, res, r.refreshToken);
    return { accessToken: r.accessToken, refreshToken: r.refreshToken, role: r.role };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token || body?.refreshToken;
    await this.auth.logout(token);
    res.clearCookie('refresh_token', this.opts(req));
  }

  private setCookie(req: Request, res: Response, token: string) {
    res.cookie('refresh_token', token, this.opts(req));
  }

  private opts(req: Request): CookieOptions {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    return {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
      maxAge: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10) * 86400000,
    };
  }
}
