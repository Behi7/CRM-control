import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EventProcessor } from './event.processor';
import { PipelineSyncProcessor } from './pipeline-sync.processor';
import { Job } from 'bullmq';
import { AppException } from '../../common/exceptions/app.exception';
@Injectable()
export class BackfillProcessor {
  private logger = new Logger('Backfill');
  constructor(private prisma: PrismaService, private crm: CrmConnectorService, private crypto: CryptoService, private events: EventProcessor, private pipelineSync: PipelineSyncProcessor) {}

  async run(accountId: number, job: Job) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken || acc.status !== 'connected' || acc.syncStatus === 'stopped') return;
    let token = this.crypto.decrypt(acc.encryptedToken);
    await this.prisma.account.update({ where: { id: accountId }, data: { backfillStatus: 'in_progress', backfillError: null, backfillErrorAt: null } });
    const startedAt = new Date();
    try {
      let accResp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/account' });
      if (accResp.status === 401) {
        const refreshed = await this.tryRefreshToken(accountId, acc.encryptedToken);
        if (refreshed) {
          acc.encryptedToken = refreshed.encryptedToken;
          token = refreshed.token;
          accResp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/account' });
        }
      }
      if (accResp.status === 401) throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired');
      if (accResp.status !== 200) throw new AppException('AMO_CRM_ERROR', accResp.status, `Account: ${accResp.status}`);
      const tz = this.normalizeTz(accResp.data?.timezone);
      await this.prisma.account.update({ where: { id: accountId }, data: { timezone: tz, externalAccountId: String(accResp.data.id) } });
      await this.syncPipelines(accountId, acc, token);
      await this.pipelineSync.syncAmoUsers(accountId, acc, token);
      const syncCtx = await this.events.buildSyncContext(accountId);
      const cursor: any = (acc.backfillCursor as any) || { phase: 'leads', page: 1, limit: 250, backfillStartedAt: startedAt.toISOString() };

      if (cursor.phase === 'leads') {
        let page = cursor.page || 1;
        while (true) {
          if (job) await job.updateProgress({ phase: 'leads', page });
          const currentAcc = await this.prisma.account.findUnique({ where: { id: accountId }, select: { syncStatus: true, status: true } });
          if (!currentAcc || currentAcc.status !== 'connected' || currentAcc.syncStatus === 'stopped') {
            this.logger.warn(`Backfill for account ${accountId} was stopped.`);
            return;
          }
          const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
            method: 'GET', path: '/api/v4/leads', params: { page, limit: cursor.limit, with: 'tags,contacts,loss_reason,source_id,source' },
          });
          if (resp.status === 401) {
            const refreshed = await this.tryRefreshToken(accountId, acc.encryptedToken);
            if (refreshed) {
              acc.encryptedToken = refreshed.encryptedToken;
              token = refreshed.token;
              continue;
            }
            throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired');
          }
          if (resp.status !== 200 && resp.status !== 204) throw new AppException('AMO_CRM_ERROR', resp.status, `Leads: ${resp.status}`);
          const items = resp.status === 204 ? [] : (resp.data?._embedded?.leads || []);
          for (const amo of items) { try { await this.events.upsertLead(this.prisma, accountId, amo, syncCtx); } catch (e) { this.logger.error(e); } }
          if (!items.length || items.length < cursor.limit) {
            cursor.phase = 'events';
            cursor.page = 1;
            delete cursor.windowFrom;
            await this.saveCursor(accountId, cursor);
            break;
          }
          page++;
          await this.saveCursor(accountId, { ...cursor, page });
        }
      }

      if (cursor.phase === 'events') {
        const minLead = await this.prisma.lead.aggregate({
          where: { accountId },
          _min: { crmCreatedAt: true },
        });
        const nowSec = Math.ceil(Date.now() / 1000) + 60;
        const defaultStartSec = minLead._min.crmCreatedAt
          ? Math.max(0, Math.floor(minLead._min.crmCreatedAt.getTime() / 1000) - 86400)
          : nowSec - 365 * 86400;
        let windowFrom: number = typeof cursor.windowFrom === 'number' ? cursor.windowFrom : defaultStartSec;
        const WINDOW_SEC = 30 * 86400; // 30-day chronological slices to keep memory bounded while preserving ASC order

        while (windowFrom < nowSec) {
          const windowTo = Math.min(windowFrom + WINDOW_SEC, nowSec);
          const windowGroups = new Map<number, any[]>();
          let page = 1;

          while (true) {
            if (job) await job.updateProgress({ phase: 'events_fetch', windowFrom, windowTo, page });
            const currentAcc = await this.prisma.account.findUnique({ where: { id: accountId }, select: { syncStatus: true, status: true } });
            if (!currentAcc || currentAcc.status !== 'connected' || currentAcc.syncStatus === 'stopped') {
              this.logger.warn(`Backfill for account ${accountId} was stopped.`);
              return;
            }
            const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
              method: 'GET',
              path: '/api/v4/events',
              params: {
                'filter[type]': 'lead_status_changed',
                'filter[created_at][from]': windowFrom,
                'filter[created_at][to]': windowTo,
                page,
                limit: 250,
              },
            });
            if (resp.status === 401) {
              const refreshed = await this.tryRefreshToken(accountId, acc.encryptedToken);
              if (refreshed) {
                acc.encryptedToken = refreshed.encryptedToken;
                token = refreshed.token;
                continue;
              }
              throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired');
            }
            if (resp.status !== 200 && resp.status !== 204) throw new AppException('AMO_CRM_ERROR', resp.status, `Events: ${resp.status}`);
            const items = resp.status === 204 ? [] : (resp.data?._embedded?.events || []);
            for (const ev of items) {
              const list = windowGroups.get(ev.entity_id) || [];
              list.push({
                id: ev.id,
                type: ev.type,
                entity_id: ev.entity_id,
                created_at: ev.created_at,
                value_after: ev.value_after,
                value_before: ev.value_before,
              });
              windowGroups.set(ev.entity_id, list);
            }
            if (!items.length || items.length < 250) break;
            page++;
          }

          let processedCount = 0;
          for (const list of windowGroups.values()) {
            list.sort((a, b) => (a.created_at - b.created_at) || (a.id - b.id));
            for (const ev of list) {
              try {
                await this.events.processStatusChanged(accountId, acc.subdomain, acc.baseDomain, token, ev);
              } catch (e) {
                this.logger.error(e);
              }
            }
            processedCount++;
            if (job && processedCount % 50 === 0) {
              await job.updateProgress({ phase: 'events_processing', windowFrom, windowTo, processedLeads: processedCount, totalLeads: windowGroups.size });
            }
          }
          windowGroups.clear();

          windowFrom = windowTo;
          cursor.windowFrom = windowFrom;
          await this.saveCursor(accountId, cursor);
        }

        cursor.phase = 'deleted_events';
        cursor.page = 1;
        delete cursor.windowFrom;
        await this.saveCursor(accountId, cursor);
      }

      if (cursor.phase === 'deleted_events') {
        let page = cursor.page || 1;
        while (true) {
          if (job) await job.updateProgress({ phase: 'deleted_events', page });
          const currentAcc = await this.prisma.account.findUnique({ where: { id: accountId }, select: { syncStatus: true, status: true } });
          if (!currentAcc || currentAcc.status !== 'connected' || currentAcc.syncStatus === 'stopped') {
            this.logger.warn(`Backfill for account ${accountId} was stopped.`);
            return;
          }
          const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
            method: 'GET', path: '/api/v4/events',
            params: { 'filter[type]': 'lead_deleted,lead_restored', page, limit: 250 },
          });
          if (resp.status === 401) {
            const refreshed = await this.tryRefreshToken(accountId, acc.encryptedToken);
            if (refreshed) {
              acc.encryptedToken = refreshed.encryptedToken;
              token = refreshed.token;
              continue;
            }
            throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired');
          }
          if (resp.status !== 200 && resp.status !== 204) throw new AppException('AMO_CRM_ERROR', resp.status, `Deleted: ${resp.status}`);
          const items = resp.status === 204 ? [] : (resp.data?._embedded?.events || []);
          for (const ev of items) {
            try {
              if (ev.type === 'lead_deleted') await this.events.processLeadDeleted(accountId, ev);
              else if (ev.type === 'lead_restored') await this.events.processLeadRestored(accountId, acc.subdomain, acc.baseDomain, token, ev);
            } catch (e) { this.logger.error(e); }
          }
          if (!items.length || items.length < 250) break;
          page++;
          await this.saveCursor(accountId, { ...cursor, page });
        }
      }

      // Bulk create fallback intervals for all leads without any stage history in one query
      await this.prisma.$executeRaw`
        INSERT INTO lead_stage_history (lead_id, stage_id, entered_at, exited_at, duration_seconds)
        SELECT 
          l.id, 
          l.current_stage_id, 
          l.crm_created_at, 
          l.crm_closed_at,
          CASE 
            WHEN l.crm_closed_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (l.crm_closed_at - l.crm_created_at))::int)
            ELSE NULL 
          END
        FROM leads l
        WHERE l.account_id = ${accountId}
          AND l.current_stage_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM lead_stage_history h WHERE h.lead_id = l.id
          )
      `;

      const overlap = parseInt(process.env.SYNC_OVERLAP_MINUTES || '2', 10) * 60 * 1000;
      await this.prisma.account.update({
        where: { id: accountId },
        data: {
          backfillStatus: 'done', backfillError: null, backfillErrorAt: null,
          lastSyncedAt: new Date(startedAt.getTime() - overlap),
          backfillCursor: { phase: 'done', completedAt: new Date().toISOString() },
        },
      });
    } catch (e: any) {
      await this.fail(accountId, e?.message || 'Unknown', acc.encryptedToken);
      throw e;
    }
  }

  private async syncPipelines(accountId: number, acc: any, token: string) {
    const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, { method: 'GET', path: '/api/v4/leads/pipelines' });
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
  }

  private async saveCursor(accountId: number, cursor: any) {
    await this.prisma.account.update({ where: { id: accountId }, data: { backfillCursor: cursor } });
  }

  private async tryRefreshToken(accountId: number, currentEncryptedToken: string): Promise<{ encryptedToken: string; token: string } | null> {
    const freshAcc = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptedToken: true, status: true, syncStatus: true },
    });
    if (
      freshAcc?.encryptedToken &&
      freshAcc.encryptedToken !== currentEncryptedToken &&
      freshAcc.status === 'connected' &&
      freshAcc.syncStatus !== 'stopped'
    ) {
      return {
        encryptedToken: freshAcc.encryptedToken,
        token: this.crypto.decrypt(freshAcc.encryptedToken),
      };
    }
    return null;
  }

  private async fail(accountId: number, err: string, usedEncryptedToken?: string) {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { backfillStatus: 'failed', backfillError: err, backfillErrorAt: new Date() },
    });
    if (err.includes('expired')) {
      if (usedEncryptedToken) {
        const freshAcc = await this.prisma.account.findUnique({ where: { id: accountId }, select: { encryptedToken: true } });
        if (freshAcc?.encryptedToken && freshAcc.encryptedToken !== usedEncryptedToken) {
          return;
        }
      }
      await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
      await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'Token expired during backfill' } });
    }
  }

  private normalizeTz(tz: string | undefined) {
    if (!tz) return 'UTC';
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; } catch { return 'UTC'; }
  }
}
