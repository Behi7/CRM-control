import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { JobSchedulerService } from '../job-scheduler.service';
@Injectable()
export class PipelineSyncProcessor {
  private logger = new Logger('PipelineSync');
  constructor(
    private prisma: PrismaService,
    private crm: CrmConnectorService,
    private crypto: CryptoService,
    private scheduler: JobSchedulerService,
  ) {}
  async runCron() {
    const accounts = await this.prisma.account.findMany({
      where: { status: 'connected', syncStatus: 'active' },
      select: { id: true },
    });
    for (const a of accounts) {
      try {
        await this.scheduler.triggerPipelineSync(a.id);
      } catch (e) {
        this.logger.error(`Error queueing pipeline sync for account ${a.id}: ${e}`);
      }
    }
  }
  async run(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken || acc.status !== 'connected' || acc.syncStatus === 'stopped') return;
    const token = this.crypto.decrypt(acc.encryptedToken);
    // Sync pipelines/stages
    const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/leads/pipelines' });
    if (resp.status === 401) {
      await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
      await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'Token expired' } });
      return;
    }
    if (resp.status !== 200) return;
    const pipes = resp.data?._embedded?.pipelines || resp.data || [];
    for (const p of pipes) {
      const pipeline = await this.prisma.pipeline.upsert({
        where: { accountId_externalId: { accountId, externalId: String(p.id) } },
        create: { accountId, externalId: String(p.id), name: p.name, isArchived: false },
        update: { name: p.name, isArchived: false },
      });
      const stages = p._embedded?.statuses || [];
      if (stages.length > 0) {
        await Promise.all(stages.map((s: any) =>
          this.prisma.stage.upsert({
            where: { pipelineId_externalId: { pipelineId: pipeline.id, externalId: String(s.id) } },
            create: { pipelineId: pipeline.id, externalId: String(s.id), name: s.name, sortOrder: s.sort ?? s.sort_order ?? 0, isArchived: false },
            update: { name: s.name, sortOrder: s.sort ?? s.sort_order ?? 0, isArchived: false },
          })
        ));
      }
      const stageIds = stages.map((x: any) => String(x.id));
      if (stageIds.length > 0) {
        await this.prisma.stage.updateMany({
          where: { pipelineId: pipeline.id, NOT: { externalId: { in: stageIds } } },
          data: { isArchived: true },
        });
      }
    }
    const pipeIds = pipes.map((x: any) => String(x.id));
    if (pipeIds.length > 0) {
      await this.prisma.pipeline.updateMany({
        where: { accountId, NOT: { externalId: { in: pipeIds } } },
        data: { isArchived: true },
      });
    }
    // Sync amo users (managers)
    await this.syncAmoUsers(accountId, acc, token);
    // Sync custom field definitions (lists, multiselects, etc.)
    await this.syncCustomFields(accountId, acc, token);
  }

  async syncAmoUsers(accountId: number, acc: any, token: string) {
    try {
      const allUsers: any[] = [];
      let page = 1;
      while (true) {
        const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
          method: 'GET',
          path: '/api/v4/users',
          params: { page, limit: 250 },
        });
        if (resp.status !== 200) break;
        const users = resp.data?._embedded?.users || [];
        if (!users.length) break;
        allUsers.push(...users);
        if (users.length < 250) break;
        page++;
      }
      if (allUsers.length > 0) {
        await Promise.all(allUsers.map((u: any) => {
          const isArchived = u.rights?.is_active === false;
          return this.prisma.amoUser.upsert({
            where: { accountId_externalId: { accountId, externalId: String(u.id) } },
            create: { accountId, externalId: String(u.id), name: u.name || `Менеджер ${u.id}`, email: u.email || null, isArchived },
            update: { name: u.name || `Менеджер ${u.id}`, email: u.email || null, isArchived },
          });
        }));
        // Mark removed users as archived
        const activeIds = allUsers.map((u: any) => String(u.id));
        await this.prisma.amoUser.updateMany({
          where: { accountId, NOT: { externalId: { in: activeIds } } },
          data: { isArchived: true },
        });
      }
    } catch (e) {
      this.logger.error(`syncAmoUsers error for account ${accountId}: ${e}`);
    }
  }

  async syncCustomFields(accountId: number, acc: any, token: string) {
    try {
      const allFields: any[] = [];
      let page = 1;
      while (true) {
        const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
          method: 'GET',
          path: '/api/v4/leads/custom_fields',
          params: { page, limit: 250 },
        });
        if (resp.status !== 200) break;
        const fields = resp.data?._embedded?.custom_fields || [];
        if (!fields.length) break;
        allFields.push(...fields);
        if (fields.length < 250) break;
        page++;
      }
      if (allFields.length > 0) {
        for (const f of allFields) {
          const rawEnums = Array.isArray(f.enums)
            ? f.enums.map((e: any) => ({
                id: e.id,
                value: e.value,
                sort: e.sort ?? 0,
              }))
            : null;

          await (this.prisma as any).customFieldDefinition.upsert({
            where: { accountId_externalId: { accountId, externalId: String(f.id) } },
            create: {
              accountId,
              externalId: String(f.id),
              name: f.name || `Поле ${f.id}`,
              code: f.code || null,
              fieldType: f.type || 'text',
              sortOrder: f.sort ?? 0,
              enums: rawEnums ?? undefined,
              isArchived: false,
            },
            update: {
              name: f.name || `Поле ${f.id}`,
              code: f.code || null,
              fieldType: f.type || 'text',
              sortOrder: f.sort ?? 0,
              enums: rawEnums ?? undefined,
              isArchived: false,
            },
          });
        }
        const activeIds = allFields.map((f: any) => String(f.id));
        await (this.prisma as any).customFieldDefinition.updateMany({
          where: { accountId, NOT: { externalId: { in: activeIds } } },
          data: { isArchived: true },
        });
      }
    } catch (e) {
      this.logger.error(`syncCustomFields error for account ${accountId}: ${e}`);
    }
  }
}
