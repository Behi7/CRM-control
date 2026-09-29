import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EventProcessor } from './event.processor';
import { JobSchedulerService } from '../job-scheduler.service';
import { AppException } from '../../common/exceptions/app.exception';
@Injectable()
export class DeltaSyncProcessor {
  private logger = new Logger('DeltaSync');
  private runningAccounts = new Set<number>();

  constructor(
    private prisma: PrismaService,
    private crm: CrmConnectorService,
    private crypto: CryptoService,
    private events: EventProcessor,
    private scheduler: JobSchedulerService,
  ) {}

  async runCron() {
    const accounts = await this.prisma.account.findMany({
      where: { status: 'connected', backfillStatus: 'done', syncStatus: 'active' },
      select: { id: true },
    });
    for (const account of accounts) {
      try {
        await this.scheduler.triggerSync(account.id);
      } catch (e) {
        this.logger.error(`Error queueing delta sync for account ${account.id}: ${e}`);
      }
    }
  }

  async run(accountId: number) {
    if (this.runningAccounts.has(accountId)) {
      this.logger.warn(`Delta sync for account ${accountId} is already running in this process, skipping.`);
      return;
    }
    this.runningAccounts.add(accountId);
    try {
      await this.doRun(accountId);
    } finally {
      this.runningAccounts.delete(accountId);
    }
  }

  async runEnrich(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken || acc.status !== 'connected') return;
    const syncCtx = await this.events.buildSyncContext(accountId);
    const token = this.crypto.decrypt(acc.encryptedToken);
    let page = 1;
    this.logger.log(`Starting BI enrichment pass for account ${accountId} (${acc.subdomain})...`);
    while (true) {
      const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
        method: 'GET',
        path: '/api/v4/leads',
        params: { page, limit: 250, with: 'tags,contacts,loss_reason' },
      });
      if (resp.status !== 200 && resp.status !== 204) break;
      const items = resp.status === 204 ? [] : (resp.data?._embedded?.leads || []);
      for (const amo of items) {
        try {
          await this.events.upsertLead(this.prisma, accountId, amo, syncCtx);
        } catch (e) {
          this.logger.error(`Error enriching lead ${amo?.id}: ${e}`);
        }
      }
      if (!items.length || items.length < 250) break;
      page++;
    }
    this.logger.log(`Completed BI enrichment pass for account ${accountId} (${acc.subdomain}).`);
  }

  private async doRun(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc || !acc.encryptedToken || acc.status !== 'connected' || acc.backfillStatus !== 'done' || acc.syncStatus === 'stopped') return;
    const syncCtx = await this.events.buildSyncContext(accountId);
    const token = this.crypto.decrypt(acc.encryptedToken);
    const jobStartedAt = new Date();
    const windowFrom = acc.lastSyncedAt;
    if (!windowFrom) return;
    let hasErrors = false;
    let page = 1;
    while (true) {
      const currentAcc = await this.prisma.account.findUnique({ where: { id: accountId }, select: { syncStatus: true, status: true } });
      if (!currentAcc || currentAcc.status !== 'connected' || currentAcc.syncStatus === 'stopped') {
        this.logger.warn(`Delta sync for account ${accountId} was stopped.`);
        return;
      }
      const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
        method: 'GET', path: '/api/v4/leads',
        params: { 'filter[updated_at][from]': Math.floor(windowFrom.getTime()/1000), page, limit: 250, with: 'tags,contacts,loss_reason' },
      });
      if (resp.status === 401) { await this.markTokenExpired(accountId); throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired'); }
      if (resp.status !== 200 && resp.status !== 204) throw new AppException('AMO_CRM_ERROR', 502, `leads: ${resp.status}`);
      const items = resp.status === 204 ? [] : (resp.data?._embedded?.leads || []);
      for (const amo of items) {
        try {
          await this.events.upsertLead(this.prisma, accountId, amo, syncCtx);
        } catch (e) {
          hasErrors = true;
          this.logger.error(`Error upserting lead ${amo?.id}: ${e}`);
        }
      }
      if (!items.length || items.length < 250) break;
      page++;
    }
    const eventGroups = new Map<number, any[]>();
    page = 1;
    while (true) {
      const resp = await this.crm.request<any>(accountId, acc.subdomain, acc.baseDomain, token, {
        method: 'GET', path: '/api/v4/events',
        params: {
          'filter[type]': 'lead_status_changed,lead_deleted,lead_restored',
          'filter[created_at][from]': Math.floor(windowFrom.getTime()/1000),
          page, limit: 250,
        },
      });
      if (resp.status === 401) { await this.markTokenExpired(accountId); throw new AppException('AMO_CRM_TOKEN_EXPIRED', 401, 'Token expired'); }
      if (resp.status !== 200 && resp.status !== 204) throw new AppException('AMO_CRM_ERROR', 502, `events: ${resp.status}`);
      const items = resp.status === 204 ? [] : (resp.data?._embedded?.events || []);
      for (const ev of items) {
        const list = eventGroups.get(ev.entity_id) || [];
        list.push({
          id: ev.id,
          type: ev.type,
          entity_id: ev.entity_id,
          created_at: ev.created_at,
          value_after: ev.value_after,
          value_before: ev.value_before,
        });
        eventGroups.set(ev.entity_id, list);
      }
      if (!items.length || items.length < 250) break;
      page++;
    }

    // Prefetch leads in batch to eliminate N+1 queries
    const leadExternalIds = Array.from(eventGroups.keys()).map(String);
    const existingLeads = leadExternalIds.length > 0
      ? await this.prisma.lead.findMany({
          where: { accountId, externalId: { in: leadExternalIds } },
        })
      : [];
    const leadMap = new Map(existingLeads.map(l => [l.externalId, l]));

    for (const [leadId, list] of eventGroups.entries()) {
      list.sort((a, b) => (a.created_at - b.created_at) || (a.id - b.id));
      for (const ev of list) {
        try {
          if (ev.type === 'lead_status_changed') await this.events.processStatusChanged(accountId, acc.subdomain, acc.baseDomain, token, ev);
          else if (ev.type === 'lead_deleted') await this.events.processLeadDeleted(accountId, ev);
          else if (ev.type === 'lead_restored') await this.events.processLeadRestored(accountId, acc.subdomain, acc.baseDomain, token, ev);
        } catch (e) {
          hasErrors = true;
          this.logger.error(`Error processing event ${ev.id} for lead ${leadId}: ${e}`);
          break; // Stop further events for this lead to maintain event sequence!
        }
      }
      let lead = leadMap.get(String(leadId));
      if (!lead) {
        lead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: String(leadId) } } }) ?? undefined;
        if (lead) leadMap.set(String(leadId), lead);
      }
      if (lead) {
        try {
          await this.events.createFallbackInterval(lead.id);
        } catch (e) {
          this.logger.error(`Error creating fallback interval for lead ${lead.id}: ${e}`);
        }
      }
    }

    if (hasErrors) {
      throw new AppException('SYNC_PARTIAL_FAILURE', 500, `Delta sync encountered errors for account ${accountId}. lastSyncedAt not advanced.`);
    }

    const overlap = parseInt(process.env.SYNC_OVERLAP_MINUTES || '2', 10) * 60 * 1000;
    await this.prisma.account.update({ where: { id: accountId }, data: { lastSyncedAt: new Date(jobStartedAt.getTime() - overlap) } });
  }
  private async markTokenExpired(accountId: number) {
    await this.prisma.account.update({ where: { id: accountId }, data: { tokenStatus: 'expired' } });
    await this.prisma.notification.create({ data: { accountId, type: 'token_expired', message: 'amoCRM token has expired. Please update it.' } });
  }
}
