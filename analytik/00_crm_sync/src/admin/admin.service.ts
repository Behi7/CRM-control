import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { CrmConnectorService } from '../crm-connector/crm-connector.service';
import { CrmRateLimiter } from '../crm-connector/http/rate-limiter';
import { AppException } from '../common/exceptions/app.exception';
import { CreateAccountDto } from './dto/create-account.dto';
import { PatchAccountDto } from './dto/patch-account.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { JobSchedulerService } from '../jobs/job-scheduler.service';
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
    private crm: CrmConnectorService,
    private scheduler: JobSchedulerService,
    private limiter: CrmRateLimiter,
  ) {}

  async listAccounts() {
    return this.prisma.account.findMany({ orderBy: { createdAt: 'desc' }, include: { users: { where: { role: 'viewer' } } } });
  }

  async createAccount(dto: CreateAccountDto) {
    if (!/^[a-z0-9-]+$/i.test(dto.subdomain)) throw new AppException('VALIDATION_ERROR', 400, 'Invalid subdomain format');
    if (!['amocrm.ru','kommo.com'].includes(dto.baseDomain)) throw new AppException('VALIDATION_ERROR', 400, 'Invalid baseDomain');
    const resp = await this.crm.request<any>(0, dto.subdomain, dto.baseDomain, dto.token, { method: 'GET', path: '/api/v4/account' });
    if (resp.status !== 200) throw new AppException('AMO_CRM_ERROR', 502, `amoCRM returned ${resp.status}`);
    const extId = String(resp.data.id);
    const timezone = this.normalizeTz(resp.data.timezone);
    const cleanSubdomain = dto.subdomain.trim().toLowerCase();
    const existingAcc = await this.prisma.account.findUnique({
      where: { subdomain_baseDomain: { subdomain: cleanSubdomain, baseDomain: dto.baseDomain } },
    });
    if (existingAcc && existingAcc.status !== 'disconnected') {
      throw new AppException('CONFLICT', 409, 'Аккаунт с таким субдоменом уже существует');
    }
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (user) throw new AppException('CONFLICT', 409, 'Email already exists');
    const encryptedToken = this.crypto.encrypt(dto.token);
    const hash = await bcrypt.hash(dto.password, 12);
    const account = await this.prisma.$transaction(async tx => {
      let a;
      if (existingAcc) {
        a = await tx.account.update({
          where: { id: existingAcc.id },
          data: {
            externalAccountId: extId,
            encryptedToken,
            tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : null,
            tokenStatus: 'active',
            subscriptionStatus: 'active',
            status: 'connected',
            syncStatus: 'active',
            timezone,
            backfillStatus: 'pending',
            backfillError: null,
            backfillErrorAt: null,
            backfillCursor: Prisma.DbNull,
          },
        });
      } else {
        a = await tx.account.create({
          data: {
            subdomain: cleanSubdomain,
            baseDomain: dto.baseDomain, externalAccountId: extId,
            encryptedToken, tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : null,
            timezone, backfillStatus: 'pending',
          },
        });
      }
      await tx.user.create({
        data: { email: dto.email.trim().toLowerCase(), passwordHash: hash, role: 'viewer', accountId: a.id },
      });
      return a;
    });
    await this.scheduler.startBackfill(account.id);
    return this.prisma.account.findUnique({ where: { id: account.id }, include: { users: { where: { role: 'viewer' } } } });
  }

  async patchAccount(accountId: number, dto: PatchAccountDto) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId }, include: { users: true } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    const viewer = acc.users.find(u => u.role === 'viewer');
    let newEncrypted: string | undefined;
    if (dto.token) {
      const resp = await this.crm.request<any>(0, acc.subdomain, acc.baseDomain, dto.token, { method: 'GET', path: '/api/v4/account' });
      if (resp.status !== 200) throw new AppException('AMO_CRM_ERROR', 502, `amoCRM returned ${resp.status}`);
      const newExtId = String(resp.data.id);
      if (acc.externalAccountId !== null && acc.externalAccountId !== newExtId) {
        throw new AppException('VALIDATION_ERROR', 400, 'Token belongs to a different amoCRM account');
      }
      newEncrypted = this.crypto.encrypt(dto.token);
    }
    await this.prisma.$transaction(async tx => {
      const upd: any = {};
      if (newEncrypted) upd.encryptedToken = newEncrypted;
      if (dto.tokenExpiresAt) upd.tokenExpiresAt = new Date(dto.tokenExpiresAt);
      if (Object.keys(upd).length > 0) await tx.account.update({ where: { id: accountId }, data: upd });
      if (dto.email || dto.password) {
        if (!viewer) throw new AppException('NOT_FOUND', 404, 'Viewer user not found');
        const uupd: any = {};
        if (dto.email) uupd.email = dto.email.trim().toLowerCase();
        if (dto.password) uupd.passwordHash = await bcrypt.hash(dto.password, 12);
        if (Object.keys(uupd).length > 0) await tx.user.update({ where: { id: viewer.id }, data: uupd });
      }
    });
    if (dto.token) {
      await this.prisma.notification.updateMany({
        where: { accountId, type: { in: ['token_expired','token_expiring_soon'] }, isRead: false },
        data: { isRead: true },
      });
    }
    if (dto.email || dto.password) {
      if (viewer) await this.prisma.refreshToken.deleteMany({ where: { userId: viewer.id } });
    }
    return this.prisma.account.findUnique({ where: { id: accountId }, include: { users: { where: { role: 'viewer' } } } });
  }

  async deleteAccount(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    await this.scheduler.stopAccountJobs(accountId);
    this.limiter.remove(accountId);
    await this.prisma.$transaction(async tx => {
      await tx.account.update({
        where: { id: accountId },
        data: { status: 'disconnected', encryptedToken: null, tokenStatus: 'expired', syncStatus: 'stopped' },
      });
      await tx.user.deleteMany({ where: { accountId } });
    });
  }

  async stopSync(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    await this.scheduler.stopAccountJobs(accountId);
    this.limiter.remove(accountId);
    return this.prisma.account.update({
      where: { id: accountId },
      data: { syncStatus: 'stopped' },
      include: { users: { where: { role: 'viewer' } } },
    });
  }

  async startSync(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { syncStatus: 'active' },
      include: { users: { where: { role: 'viewer' } } },
    });
    if (acc.backfillStatus !== 'done') {
      await this.scheduler.startBackfill(accountId);
    } else {
      await this.scheduler.triggerSync(accountId);
    }
    return updated;
  }

  async retryBackfill(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    if (acc.backfillStatus !== 'failed') throw new AppException('VALIDATION_ERROR', 400, 'Backfill is not in failed state');
    await this.scheduler.startBackfill(accountId);
    return { ok: true };
  }

  async enrichAccount(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    await this.scheduler.triggerEnrich(accountId);
    return { ok: true, message: 'BI enrichment queued in 00_crm_sync' };
  }

  async listNotifications(unreadOnly: boolean) {
    return this.prisma.notification.findMany({ where: unreadOnly ? { isRead: false } : undefined, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async markNotificationRead(id: number) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async getAiSettings(accountId: number) {
    const acc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        aiEnabled: true,
        aiModel: true,
        aiCompanyContext: true,
        aiEncryptedToken: true,
      },
    });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');
    return {
      accountId: acc.id,
      aiEnabled: acc.aiEnabled,
      aiModel: acc.aiModel || 'gemini-2.5-flash',
      hasToken: !!acc.aiEncryptedToken,
      aiCompanyContext: acc.aiCompanyContext || '',
    };
  }

  async updateAiSettings(accountId: number, dto: UpdateAiSettingsDto) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new AppException('NOT_FOUND', 404, 'Account not found');

    const data: any = {};
    if (dto.aiEnabled !== undefined) data.aiEnabled = dto.aiEnabled;
    if (dto.aiModel !== undefined) data.aiModel = dto.aiModel.trim();
    if (dto.aiCompanyContext !== undefined) data.aiCompanyContext = dto.aiCompanyContext.trim();

    if (dto.aiToken) {
      data.aiEncryptedToken = this.crypto.encrypt(dto.aiToken.trim());
    }

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data,
      select: {
        id: true,
        aiEnabled: true,
        aiModel: true,
        aiCompanyContext: true,
        aiEncryptedToken: true,
      },
    });

    return {
      accountId: updated.id,
      aiEnabled: updated.aiEnabled,
      aiModel: updated.aiModel || 'gemini-2.5-flash',
      hasToken: !!updated.aiEncryptedToken,
      aiCompanyContext: updated.aiCompanyContext || '',
    };
  }

  private normalizeTz(tz: string | undefined): string {
    if (!tz) return 'UTC';
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch { return 'UTC'; }
  }

  async testAiConnection(model: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
    const cleanModel = (model || 'gemini-2.5-flash').trim().replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey.trim()}`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом "OK" для проверки связи.' }] }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        const errJson = await (resp as any).json().catch(() => null);
        const errDetail = errJson?.error?.message || `HTTP ${resp.status} ${resp.statusText}`;
        return { ok: false, message: `Ошибка Gemini API: ${errDetail}` };
      }

      return { ok: true, message: 'Соединение с моделью успешно проверено!' };
    } catch (e: any) {
      return { ok: false, message: `Ошибка запроса к Gemini: ${e?.message || 'Неизвестная ошибка'}` };
    }
  }
}
