import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { join, Sql, sqltag } from '@prisma/client/runtime/library';
@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}
  private async freshness(accountId: number) {
    const acc = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!acc) throw new NotFoundException();
    const staleMs = parseInt(process.env.STALE_THRESHOLD_MINUTES || '30', 10) * 60 * 1000;
    const isStale = !acc.lastSyncedAt || (Date.now() - acc.lastSyncedAt.getTime() > staleMs) || acc.backfillStatus !== 'done';
    return { dataFreshness: { lastSyncedAt: acc.lastSyncedAt?.toISOString() ?? null, isStale } };
  }
  async getPipelines(accountId: number) {
    const items = await this.prisma.pipeline.findMany({ where: { accountId, isArchived: false }, orderBy: { id: 'asc' } });
    return { ...await this.freshness(accountId), items };
  }
  async getTags(accountId: number) {
    const items = await this.prisma.tag.findMany({
      where: { accountId, leadTags: { some: {} }, isArchived: false }, orderBy: { name: 'asc' },
    });
    return { ...await this.freshness(accountId), items };
  }
  async getManagers(accountId: number) {
    const items = await this.prisma.amoUser.findMany({
      where: { accountId, isArchived: false },
      orderBy: { name: 'asc' },
    });
    return { ...await this.freshness(accountId), items };
  }
  async getStagesStats(pipelineId: number, tagIds?: number[], status?: string, managerIds?: number[], dateFrom?: string, dateTo?: string) {
    const pipeline = await this.prisma.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: true } });
    if (!pipeline) throw new NotFoundException();
    const accountId = pipeline.accountId;
    const tagFilter = this.buildTagFilter(tagIds);
    const statusFilter = this.buildStatusFilter(status);
    const managerFilter = this.buildManagerFilter(managerIds);
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);
    const stages = await this.prisma.stage.findMany({ where: { pipelineId, isArchived: false }, orderBy: { sortOrder: 'asc' } });
    const stageIds = stages.map(s => s.id);
    if (stageIds.length === 0) {
      return { ...await this.freshness(accountId), items: [] };
    }

    const stageIdsArr = sqltag`ARRAY[${join(stageIds.map(id => sqltag`${id}`), ',')}]::int[]`;

    const statsPromise = this.prisma.$queryRaw<any[]>`
      SELECT 
        h.stage_id,
        AVG(h.duration_seconds) FILTER (WHERE h.exited_at IS NOT NULL)::float as avg_closed_seconds,
        COUNT(h.id) FILTER (WHERE h.exited_at IS NOT NULL)::int as closed_count,
        COUNT(h.id) FILTER (WHERE h.exited_at IS NULL)::int as active_count,
        COUNT(DISTINCT h.lead_id) FILTER (WHERE h.exited_at IS NOT NULL)::int as closed_leads,
        COUNT(DISTINCT h.lead_id)::int as unique_leads
      FROM lead_stage_history h 
      JOIN leads l ON l.id = h.lead_id
      WHERE h.stage_id = ANY(${stageIdsArr}) AND l.status <> 'gone' ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
      GROUP BY h.stage_id`;

    const skipsPromise = this.prisma.$queryRaw<any[]>`
      SELECT 
        sk.skipped_stage_id as stage_id,
        COUNT(*)::int as cnt, 
        COUNT(DISTINCT sk.lead_id)::int AS unique_leads 
      FROM lead_stage_skips sk 
      JOIN leads l ON l.id = sk.lead_id
      WHERE sk.skipped_stage_id = ANY(${stageIdsArr}) AND l.status <> 'gone' ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
      GROUP BY sk.skipped_stage_id`;

    const terminalPromise = this.prisma.$queryRaw<any[]>`
      SELECT 
        l.status,
        COUNT(*)::int AS cnt
      FROM leads l
      WHERE l.pipeline_id = ${pipelineId}::int 
        AND l.status IN ('won', 'lost')
        ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
      GROUP BY l.status`;

    const [statsRows, skipsRows, terminalRows] = await Promise.all([statsPromise, skipsPromise, terminalPromise]);

    const statsMap = new Map<number, any>(statsRows.map(r => [Number(r.stage_id), r]));
    const skipsMap = new Map<number, any>(skipsRows.map(r => [Number(r.stage_id), r]));
    const terminalMap = new Map<string, number>(terminalRows.map(r => [r.status, Number(r.cnt || 0)]));

    const result = stages.map((s) => {
      if (s.externalId === '142' || s.externalId === '143') {
        const terminalStatus = s.externalId === '142' ? 'won' : 'lost';
        const count = terminalMap.get(terminalStatus) || 0;

        return {
          stageId: s.id.toString(),
          externalId: s.externalId,
          name: s.name,
          sortOrder: s.sortOrder,
          avgSecondsActual: null,
          avgSecondsIncludingSkips: null,
          skipsCount: 0,
          leadsCount: count,
          activeLeadsCount: count,
          activeHistoryCount: 0,
        };
      }

      const statsQuery = statsMap.get(s.id);
      const skipsQuery = skipsMap.get(s.id);

      const closedCount = Number(statsQuery?.closed_count || 0);
      const activeCount = Number(statsQuery?.active_count || 0);
      const closedLeads = Number(statsQuery?.closed_leads || 0);
      const skipsCount = Number(skipsQuery?.cnt || 0);

      const avgClosed = closedCount > 0 && statsQuery?.avg_closed_seconds != null
        ? Math.round(Number(statsQuery.avg_closed_seconds))
        : null;

      const avgIncluding = avgClosed != null && (closedCount + skipsCount) > 0 
        ? Math.round((avgClosed * closedCount) / (closedCount + skipsCount)) 
        : null;

      return {
        stageId: s.id.toString(), 
        externalId: s.externalId,
        name: s.name, 
        sortOrder: s.sortOrder,
        avgSecondsActual: avgClosed, 
        avgSecondsIncludingSkips: avgIncluding,
        skipsCount, 
        leadsCount: closedLeads, 
        activeLeadsCount: activeCount, 
        activeHistoryCount: activeCount,
      };
    });
    return { ...await this.freshness(accountId), items: result };
  }
  async getActiveLeads(stageId: number, page = 1, perPage = 50, tagIds?: number[], status?: string, managerIds?: number[], dateFrom?: string, dateTo?: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id: stageId }, include: { pipeline: true } });
    if (!stage) throw new NotFoundException();
    const tagFilter = this.buildTagFilter(tagIds);
    const statusFilter = this.buildStatusFilter(status);
    const managerFilter = this.buildManagerFilter(managerIds);
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);

    if (stage.externalId === '142' || stage.externalId === '143') {
      const terminalStatus = stage.externalId === '142' ? 'won' : 'lost';
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT l.id::text, l.external_id::text, l.name, l.crm_closed_at AS entered_at, l.status, l.price::text,
          au.name as responsible_name
        FROM leads l
        LEFT JOIN amo_users au ON au.id = l.responsible_user_id
        WHERE l.pipeline_id = ${stage.pipelineId}::int 
          AND l.status = ${terminalStatus}::text 
          ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
        ORDER BY l.crm_closed_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
      const totalRows = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as c FROM leads l
        WHERE l.pipeline_id = ${stage.pipelineId}::int 
          AND l.status = ${terminalStatus}::text 
          ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}`;
      return { ...await this.freshness(stage.pipeline.accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
    }

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT l.id::text, l.external_id::text, l.name, h.entered_at, l.status, l.price::text,
        au.name as responsible_name
      FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
      LEFT JOIN amo_users au ON au.id = l.responsible_user_id
      WHERE h.stage_id = ${stageId}::int AND h.exited_at IS NULL AND l.status <> 'gone' ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
      ORDER BY h.entered_at ASC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as c FROM lead_stage_history h JOIN leads l ON l.id = h.lead_id
      WHERE h.stage_id = ${stageId}::int AND h.exited_at IS NULL AND l.status <> 'gone' ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}`;
    return { ...await this.freshness(stage.pipeline.accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  async getLeadHistory(leadId: number) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        leadTags: { include: { tag: true } },
        responsibleUser: true,
      },
    });
    if (!lead) throw new NotFoundException();
    const history = await this.prisma.$queryRaw<any[]>`
      SELECT s.name as stage_name, s.external_id::text, h.entered_at, h.exited_at,
        CASE WHEN h.exited_at IS NULL THEN EXTRACT(EPOCH FROM (now() - h.entered_at))::int ELSE h.duration_seconds END AS duration_seconds
      FROM lead_stage_history h JOIN stages s ON s.id = h.stage_id
      WHERE h.lead_id = ${leadId}::int ORDER BY h.entered_at ASC`;
    const skips = await this.prisma.$queryRaw<any[]>`
      SELECT sk.source_event_id::text, sk.transition_at, sk.direction,
        fs.name as from_stage_name, ts.name as to_stage_name, ss.name as skipped_stage_name
      FROM lead_stage_skips sk
      JOIN stages fs ON fs.id = sk.from_stage_id JOIN stages ts ON ts.id = sk.to_stage_id JOIN stages ss ON ss.id = sk.skipped_stage_id
      WHERE sk.lead_id = ${leadId}::int ORDER BY sk.transition_at ASC`;
    const leadData: any = { ...lead };
    if (leadData.price != null) leadData.price = leadData.price.toString();
    return { ...await this.freshness(lead.accountId), lead: leadData, history, skips };
  }
  async searchLeads(accountId: number, q: string, page = 1, perPage = 50, tagIds?: number[], status?: string, managerIds?: number[], dateFrom?: string, dateTo?: string) {
    if (q.length < 2) return { ...await this.freshness(accountId), items: [], page, perPage, total: 0 };
    const like = `%${q.replace(/%/g,'\\%').replace(/_/g,'\\_')}%`;
    const matchFilter = sqltag`AND (l.name ILIKE ${like}::text OR l.external_id ILIKE ${like}::text)`;
    const tagFilter = this.buildTagFilter(tagIds);
    const statusFilter = status ? sqltag`AND l.status = ${status}::text` : sqltag``;
    const managerFilter = this.buildManagerFilter(managerIds);
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text, l.crm_created_at, l.crm_closed_at,
        au.name as responsible_name
      FROM leads l
      LEFT JOIN amo_users au ON au.id = l.responsible_user_id
      WHERE l.account_id = ${accountId}::int AND l.status <> 'gone' ${matchFilter} ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}
      ORDER BY l.crm_created_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as c FROM leads l WHERE l.account_id = ${accountId}::int AND l.status <> 'gone' ${matchFilter} ${tagFilter} ${statusFilter} ${managerFilter} ${dateFilter}`;
    return { ...await this.freshness(accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  async listLeadsByStatus(accountId: number, status: string, page = 1, perPage = 50, tagIds?: number[], managerIds?: number[], dateFrom?: string, dateTo?: string) {
    const tagFilter = this.buildTagFilter(tagIds);
    const managerFilter = this.buildManagerFilter(managerIds);
    const dateFilter = this.buildDateFilter(dateFrom, dateTo);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT l.id::text, l.external_id::text, l.name, l.status, l.price::text, l.crm_created_at, l.crm_closed_at,
        au.name as responsible_name
      FROM leads l
      LEFT JOIN amo_users au ON au.id = l.responsible_user_id
      WHERE l.account_id = ${accountId}::int AND l.status = ${status}::text ${tagFilter} ${managerFilter} ${dateFilter}
      ORDER BY l.crm_created_at DESC LIMIT ${perPage}::int OFFSET ${((page-1)*perPage)}::int`;
    const totalRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int as c FROM leads l WHERE l.account_id = ${accountId}::int AND l.status = ${status}::text ${tagFilter} ${managerFilter} ${dateFilter}`;
    return { ...await this.freshness(accountId), items: rows, page, perPage, total: Number(totalRows[0].c) };
  }
  private buildTagFilter(tagIds?: number[]): Sql {
    if (!tagIds || tagIds.length === 0) return sqltag``;
    const count = tagIds.length;
    const arr = sqltag`ARRAY[${join(tagIds.map(t => sqltag`${t}`), ',')}]::int[]`;
    return sqltag`
      AND l.id IN (
        SELECT lt.lead_id FROM lead_tags lt WHERE lt.tag_id = ANY(${arr})
        GROUP BY lt.lead_id HAVING COUNT(DISTINCT lt.tag_id) = ${count}::int
      )`;
  }
  private buildStatusFilter(status?: string): Sql {
    if (!status || status === 'all') return sqltag``;
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
    const allowed = ['open', 'won', 'lost'];
    const valid = statuses.filter(s => allowed.includes(s));
    if (valid.length === 0) return sqltag``;
    return sqltag`AND l.status IN (${join(valid.map(s => sqltag`${s}::text`), ',')})`;
  }
  private buildManagerFilter(managerIds?: number[]): Sql {
    if (!managerIds || managerIds.length === 0) return sqltag``;
    const arr = sqltag`ARRAY[${join(managerIds.map(id => sqltag`${id}`), ',')}]::int[]`;
    return sqltag`AND l.responsible_user_id = ANY(${arr})`;
  }
  private buildDateFilter(dateFrom?: string, dateTo?: string): Sql {
    if (!dateFrom && !dateTo) return sqltag``;
    const parseUtcBoundary = (d: string, endOfDay: boolean): Date | null => {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(d);
      const isoStr = isDateOnly ? `${d}T${endOfDay ? '23:59:59.999Z' : '00:00:00.000Z'}` : d;
      const parsed = new Date(isoStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    if (dateFrom && dateTo) {
      let from = parseUtcBoundary(dateFrom, false);
      let to = parseUtcBoundary(dateTo, true);
      if (!from || !to) return sqltag``;
      if (from > to) {
        const tmp = from;
        from = to;
        to = tmp;
      }
      return sqltag`AND l.crm_created_at >= ${from} AND l.crm_created_at <= ${to}`;
    }
    if (dateFrom) {
      const from = parseUtcBoundary(dateFrom, false);
      if (!from) return sqltag``;
      return sqltag`AND l.crm_created_at >= ${from}`;
    }
    const to = parseUtcBoundary(dateTo!, true);
    if (!to) return sqltag``;
    return sqltag`AND l.crm_created_at <= ${to}`;
  }
}
