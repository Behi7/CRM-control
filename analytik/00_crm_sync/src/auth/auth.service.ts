import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  role: string;
  accountId: number | null;
}

interface CachedSession extends RefreshResult {
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private readonly refreshGraceMap = new Map<string, CachedSession>();
  private readonly inFlightRefreshes = new Map<string, Promise<RefreshResult | null>>();

  constructor(private prisma: PrismaService, private jwt: JwtService) {
    setInterval(async () => {
      const now = Date.now();
      for (const [h, entry] of this.refreshGraceMap.entries()) {
        if (entry.expiresAt <= now) {
          this.refreshGraceMap.delete(h);
        }
      }
      try {
        await this.prisma.refreshToken.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
      } catch {
        // ignore background cleanup errors
      }
    }, 60000).unref();
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { account: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.account?.status === 'disconnected') throw new UnauthorizedException('Account disconnected');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, accountId: user.accountId });
    const refreshToken = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const ttlDays = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + ttlDays * 86400000) },
    });
    return { accessToken, refreshToken, role: user.role };
  }

  async refresh(token: string) {
    if (!token) return null;
    const hash = createHash('sha256').update(token).digest('hex');

    const cached = this.refreshGraceMap.get(hash);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        accessToken: cached.accessToken,
        refreshToken: cached.refreshToken,
        role: cached.role,
        accountId: cached.accountId,
      };
    }

    const inFlight = this.inFlightRefreshes.get(hash);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const cachedInside = this.refreshGraceMap.get(hash);
        if (cachedInside && cachedInside.expiresAt > Date.now()) {
          return {
            accessToken: cachedInside.accessToken,
            refreshToken: cachedInside.refreshToken,
            role: cachedInside.role,
            accountId: cachedInside.accountId,
          };
        }

        return await this.prisma.$transaction(async (tx) => {
          const stored = await tx.refreshToken.findUnique({
            where: { tokenHash: hash }, include: { user: { include: { account: true } } },
          });
          if (!stored || stored.expiresAt < new Date()) return null;
          await tx.refreshToken.deleteMany({ where: { id: stored.id } });
          const user = stored.user;
          if (user.account?.status === 'disconnected') return null;
          const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, accountId: user.accountId });
          const newRefresh = randomBytes(32).toString('base64url');
          const newHash = createHash('sha256').update(newRefresh).digest('hex');
          const ttlDays = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
          await tx.refreshToken.create({
            data: { userId: user.id, tokenHash: newHash, expiresAt: new Date(Date.now() + ttlDays * 86400000) },
          });

          const result = { accessToken, refreshToken: newRefresh, role: user.role, accountId: user.accountId };
          this.refreshGraceMap.set(hash, {
            ...result,
            expiresAt: Date.now() + 30000,
          });

          return result;
        });
      } finally {
        this.inFlightRefreshes.delete(hash);
      }
    })();

    this.inFlightRefreshes.set(hash, promise);
    return promise;
  }

  async logout(token: string) {
    if (!token) return;
    const hash = createHash('sha256').update(token).digest('hex');
    this.refreshGraceMap.delete(hash);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash: hash } });
  }
}
