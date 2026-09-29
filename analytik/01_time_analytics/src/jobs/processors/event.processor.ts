import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CrmConnectorService } from '../../crm-connector/crm-connector.service';

export interface CrmEvent { id: number; type: string; entity_id: number; created_at: number; value_after?: any; value_before?: any; }
export interface AmoLead { id: number; name: string; status_id: number; pipeline_id: number; created_at: number; updated_at: number; closed_at?: number; price: number|string; responsible_user_id?: number; _embedded?: { tags?: Array<{id: number; name: string}> }; }

export interface EventSyncContext {
  pipelineMap?: Map<string, number>;
  stageMap?: Map<string, number>;
  stageObjects?: Map<number, any>;
  amoUserMap?: Map<string, number>;
  tagMap?: Map<string, number>;
}

@Injectable()
export class EventProcessor {
  constructor(private prisma: PrismaService, private crm: CrmConnectorService) {}

  async buildSyncContext(accountId: number): Promise<EventSyncContext> {
    const pipelines = await this.prisma.pipeline.findMany({
      where: { accountId },
      include: { stages: true },
    });
    const amoUsers = await this.prisma.amoUser.findMany({
      where: { accountId },
      select: { id: true, externalId: true },
    });
    const tags = await this.prisma.tag.findMany({
      where: { accountId },
      select: { id: true, externalId: true },
    });

    const pipelineMap = new Map<string, number>();
    const stageMap = new Map<string, number>();
    const stageObjects = new Map<number, any>();
    for (const p of pipelines) {
      pipelineMap.set(p.externalId, p.id);
      for (const s of p.stages) {
        stageMap.set(`${p.externalId}_${s.externalId}`, s.id);
        stageMap.set(`stage_${s.externalId}`, s.id);
        stageObjects.set(s.id, s);
      }
    }

    const amoUserMap = new Map<string, number>(amoUsers.map(u => [u.externalId, u.id]));
    const tagMap = new Map<string, number>(tags.map(t => [t.externalId, t.id]));

    return { pipelineMap, stageMap, stageObjects, amoUserMap, tagMap };
  }

  private extractStatusInfo(v: any): { statusId: number; pipelineId?: number } | null {
    if (!v) return null;
    if (typeof v === 'string') {
      try { return this.extractStatusInfo(JSON.parse(v)); } catch { return null; }
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const status = this.extractStatusInfo(item);
        if (status) return status;
      }
      return null;
    }
    if (typeof v !== 'object') return null;
    if (v.lead_status?.id != null) {
      return { statusId: Number(v.lead_status.id), pipelineId: v.lead_status.pipeline_id != null ? Number(v.lead_status.pipeline_id) : undefined };
    }
    if (v.status_id != null) return { statusId: Number(v.status_id), pipelineId: v.pipeline_id != null ? Number(v.pipeline_id) : undefined };
    if (v.statusId != null) return { statusId: Number(v.statusId), pipelineId: v.pipelineId != null ? Number(v.pipelineId) : undefined };
    if (v.pipeline_id != null && v.id != null) return { statusId: Number(v.id), pipelineId: Number(v.pipeline_id) };
    if (v.value != null) return this.extractStatusInfo(v.value);
    return null;
  }

  async upsertLead(tx: any, accountId: number, amo: AmoLead, ctx?: EventSyncContext) {
    const pipelineExt = String(amo.pipeline_id);
    const stageExt = String(amo.status_id);

    let pipelineId = ctx?.pipelineMap?.get(pipelineExt) ?? null;
    if (pipelineId == null) {
      const pipeline = await tx.pipeline.findFirst({ where: { accountId, externalId: pipelineExt } });
      pipelineId = pipeline?.id ?? null;
      if (pipelineId && ctx?.pipelineMap) ctx.pipelineMap.set(pipelineExt, pipelineId);
    }

    let stageId: number | null = null;
    if (pipelineId) {
      stageId = ctx?.stageMap?.get(`${pipelineExt}_${stageExt}`) ?? ctx?.stageMap?.get(`stage_${stageExt}`) ?? null;
      if (stageId == null) {
        const st = await tx.stage.findFirst({ where: { pipelineId, externalId: stageExt } });
        stageId = st?.id ?? null;
        if (stageId && ctx?.stageMap) {
          ctx.stageMap.set(`${pipelineExt}_${stageExt}`, stageId);
          ctx.stageMap.set(`stage_${stageExt}`, stageId);
        }
      }
    }

    let status: string = 'open';
    let closed: Date | null = null;
    if (amo.status_id === 142) { status = 'won'; closed = amo.closed_at ? new Date(amo.closed_at * 1000) : null; stageId = null; }
    else if (amo.status_id === 143) { status = 'lost'; closed = amo.closed_at ? new Date(amo.closed_at * 1000) : null; stageId = null; }
    const priceNum = amo.price != null ? Number(amo.price) : null;

    // Upsert responsible user
    let responsibleUserId: number | null = null;
    if (amo.responsible_user_id) {
      const respExt = String(amo.responsible_user_id);
      if (ctx?.amoUserMap?.has(respExt)) {
        responsibleUserId = ctx.amoUserMap.get(respExt)!;
      } else {
        const amoUser = await tx.amoUser.upsert({
          where: { accountId_externalId: { accountId, externalId: respExt } },
          create: { accountId, externalId: respExt, name: `Менеджер ${respExt}` },
          update: {},
        });
        responsibleUserId = amoUser.id;
        if (ctx?.amoUserMap) ctx.amoUserMap.set(respExt, amoUser.id);
      }
    }

    const lead = await tx.lead.upsert({
      where: { accountId_externalId: { accountId, externalId: String(amo.id) } },
      create: {
        accountId, externalId: String(amo.id), name: amo.name || null,
        pipelineId, currentStageId: stageId,
        responsibleUserId,
        status, price: priceNum != null ? priceNum as any : null,
        crmCreatedAt: new Date(amo.created_at * 1000),
        crmClosedAt: closed, updatedAt: new Date(amo.updated_at * 1000),
      },
      update: {
        name: amo.name || null,
        pipelineId, currentStageId: stageId,
        responsibleUserId,
        status, crmClosedAt: closed, updatedAt: new Date(amo.updated_at * 1000),
      },
    });

    if (amo._embedded?.tags && amo._embedded.tags.length > 0) {
      const tagIds: number[] = [];
      for (const t of amo._embedded.tags) {
        const tExt = String(t.id);
        let tagId = ctx?.tagMap?.get(tExt);
        if (tagId === undefined) {
          const tagRecord = await tx.tag.upsert({
            where: { accountId_externalId: { accountId, externalId: tExt } },
            create: { accountId, externalId: tExt, name: t.name },
            update: { name: t.name },
          });
          tagId = tagRecord.id;
          ctx?.tagMap?.set(tExt, tagRecord.id);
        }
        if (typeof tagId === 'number') {
          tagIds.push(tagId);
        }
      }
      await tx.leadTag.deleteMany({ where: { leadId: lead.id } });
      if (tagIds.length > 0) {
        await tx.leadTag.createMany({
          data: tagIds.map(tid => ({ leadId: lead.id, tagId: tid })),
          skipDuplicates: true,
        });
      }
    } else {
      await tx.leadTag.deleteMany({ where: { leadId: lead.id } });
    }
    return lead;
  }

  async processStatusChanged(accountId: number, subdomain: string, baseDomain: string, token: string, event: CrmEvent) {
    const existingQuick = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existingQuick) return;

    const leadExtId = String(event.entity_id);
    let amoLeadData: AmoLead | null = null;
    const existingLead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
    if (!existingLead) {
      const resp = await this.crm.request<any>(accountId, subdomain, baseDomain, token, {
        method: 'GET', path: `/api/v4/leads/${event.entity_id}`, params: { with: 'tags' },
      });
      if (resp.status !== 200) {
        await this.prisma.processedCrmEvent.create({
          data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' },
        });
        return;
      }
      amoLeadData = resp.data;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${accountId}::int, hashtext(${String(event.entity_id)}))`;

      const existing = await tx.processedCrmEvent.findUnique({
        where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
      });
      if (existing) return;

      let lead = await tx.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
      if (!lead && amoLeadData) {
        lead = await this.upsertLead(tx, accountId, amoLeadData);
      }
      if (!lead) return;

      const ts = new Date(event.created_at * 1000);
      const statusInfo = this.extractStatusInfo(event.value_after);
      const statusAfter = statusInfo?.statusId ?? null;
      let result = 'processed';

      if (statusAfter === 142 || statusAfter === 143) {
        let open = await tx.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null }, orderBy: { enteredAt: 'desc' } });
        if (!open) {
          const previousStatus = this.extractStatusInfo(event.value_before);
          if (previousStatus) {
            const previousStage = previousStatus.pipelineId != null
              ? await tx.stage.findFirst({ where: { pipeline: { accountId, externalId: String(previousStatus.pipelineId) }, externalId: String(previousStatus.statusId) } })
              : await tx.stage.findFirst({ where: { pipeline: { accountId }, externalId: String(previousStatus.statusId) } });
            if (previousStage) {
              open = await tx.leadStageHistory.create({
                data: { leadId: lead.id, stageId: previousStage.id, enteredAt: lead.crmCreatedAt, exitedAt: null },
              });
            }
          }
        }
        if (open) {
          const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
          await tx.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
        }
        await tx.lead.update({
          where: { id: lead.id },
          data: { status: statusAfter === 142 ? 'won' : 'lost', crmClosedAt: ts, updatedAt: ts, currentStageId: null },
        });
        result = statusAfter === 142 ? 'closed_won' : 'closed_lost';
      } else {
        if (statusAfter == null) {
          await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_stage' } });
          return;
        }
        let stage = statusInfo?.pipelineId != null
          ? await tx.stage.findFirst({ where: { pipeline: { accountId, externalId: String(statusInfo.pipelineId) }, externalId: String(statusAfter) } })
          : await tx.stage.findFirst({ where: { pipeline: { accountId }, externalId: String(statusAfter) } });
        if (!stage) {
          const pipeline = statusInfo?.pipelineId != null
            ? await tx.pipeline.findUnique({ where: { accountId_externalId: { accountId, externalId: String(statusInfo.pipelineId) } } })
            : null;
          if (pipeline) {
            stage = await tx.stage.create({
              data: { pipelineId: pipeline.id, externalId: String(statusAfter), name: `Архивный этап ${statusAfter}`, isArchived: true },
            });
          } else {
            await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_stage' } });
            return;
          }
        }
        let open = await tx.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null }, orderBy: { enteredAt: 'desc' } });
        if (!open) {
          const previousStatus = this.extractStatusInfo(event.value_before);
          if (previousStatus) {
            const previousStage = previousStatus.pipelineId != null
              ? await tx.stage.findFirst({ where: { pipeline: { accountId, externalId: String(previousStatus.pipelineId) }, externalId: String(previousStatus.statusId) } })
              : await tx.stage.findFirst({ where: { pipeline: { accountId }, externalId: String(previousStatus.statusId) } });
            if (previousStage) {
              open = await tx.leadStageHistory.create({
                data: { leadId: lead.id, stageId: previousStage.id, enteredAt: lead.crmCreatedAt, exitedAt: null },
              });
            }
          }
        }
        if (open && open.stageId !== stage.id) {
          const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
          await tx.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
          const fromStage = await tx.stage.findUnique({ where: { id: open.stageId } });
          if (fromStage && fromStage.pipelineId === stage.pipelineId && fromStage.sortOrder != null && stage.sortOrder != null) {
            const diff = stage.sortOrder - fromStage.sortOrder;
            if (Math.abs(diff) > 1) {
              const dir = diff > 0 ? 'forward' : 'backward';
              const lo = Math.min(fromStage.sortOrder, stage.sortOrder);
              const hi = Math.max(fromStage.sortOrder, stage.sortOrder);
              const between = await tx.stage.findMany({
                where: { pipelineId: fromStage.pipelineId, sortOrder: { gt: lo, lt: hi }, isArchived: false },
              });
              for (const sk of between) {
                await tx.leadStageSkip.upsert({
                  where: { leadId_sourceEventId_skippedStageId: { leadId: lead.id, sourceEventId: String(event.id), skippedStageId: sk.id } },
                  create: {
                    accountId, leadId: lead.id, pipelineId: fromStage.pipelineId,
                    sourceEventId: String(event.id), transitionAt: ts,
                    fromStageId: fromStage.id, toStageId: stage.id, skippedStageId: sk.id, direction: dir,
                  },
                  update: {},
                });
              }
            }
          }
        }
        if (!open || open.stageId !== stage.id) {
          await tx.leadStageHistory.create({
            data: { leadId: lead.id, stageId: stage.id, enteredAt: ts, exitedAt: null, sourceEventId: String(event.id) },
          });
        }
        const updates: any = { currentStageId: stage.id, updatedAt: ts };
        if (lead.status === 'won' || lead.status === 'lost') { updates.status = 'open'; updates.crmClosedAt = null; }
        await tx.lead.update({ where: { id: lead.id }, data: updates });
      }
      await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result } });
    }, { maxWait: 10000, timeout: 20000 });
  }

  async processLeadDeleted(accountId: number, event: CrmEvent) {
    const existingQuick = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existingQuick) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${accountId}::int, hashtext(${String(event.entity_id)}))`;
      const existing = await tx.processedCrmEvent.findUnique({
        where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
      });
      if (existing) return;

      const leadExtId = String(event.entity_id);
      const lead = await tx.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
      if (!lead) {
        await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' } });
        return;
      }
      const ts = new Date(event.created_at * 1000);
      const open = await tx.leadStageHistory.findFirst({ where: { leadId: lead.id, exitedAt: null }, orderBy: { enteredAt: 'desc' } });
      if (open) {
        const dur = Math.max(0, Math.floor((ts.getTime() - open.enteredAt.getTime()) / 1000));
        await tx.leadStageHistory.update({ where: { id: open.id }, data: { exitedAt: ts, durationSeconds: dur } });
      }
      await tx.lead.update({ where: { id: lead.id }, data: { status: 'gone', updatedAt: ts } });
      await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'deleted' } });
    }, { maxWait: 10000, timeout: 20000 });
  }

  async processLeadRestored(accountId: number, subdomain: string, baseDomain: string, token: string, event: CrmEvent) {
    const existingQuick = await this.prisma.processedCrmEvent.findUnique({
      where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
    });
    if (existingQuick) return;

    const leadExtId = String(event.entity_id);
    let amoLeadData: AmoLead | null = null;
    const existingLead = await this.prisma.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
    if (!existingLead) {
      const resp = await this.crm.request<any>(accountId, subdomain, baseDomain, token, {
        method: 'GET', path: `/api/v4/leads/${event.entity_id}`, params: { with: 'tags' },
      });
      if (resp.status !== 200) {
        await this.prisma.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'skipped_unknown_lead' } });
        return;
      }
      amoLeadData = resp.data;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${accountId}::int, hashtext(${String(event.entity_id)}))`;
      const existing = await tx.processedCrmEvent.findUnique({
        where: { accountId_externalEventId: { accountId, externalEventId: String(event.id) } },
      });
      if (existing) return;

      let lead = await tx.lead.findUnique({ where: { accountId_externalId: { accountId, externalId: leadExtId } } });
      if (!lead && amoLeadData) {
        lead = await this.upsertLead(tx, accountId, amoLeadData);
      }
      if (!lead) return;

      const ts = new Date(event.created_at * 1000);
      await tx.lead.update({ where: { id: lead.id }, data: { updatedAt: ts } });
      if (lead.currentStageId && !lead.crmClosedAt) {
        await tx.leadStageHistory.create({
          data: { leadId: lead.id, stageId: lead.currentStageId, enteredAt: ts, exitedAt: null, sourceEventId: String(event.id) },
        });
      }
      await tx.processedCrmEvent.create({ data: { accountId, externalEventId: String(event.id), leadExternalId: leadExtId, result: 'restored' } });
    }, { maxWait: 10000, timeout: 20000 });
  }

  async createFallbackInterval(leadId: number) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.currentStageId) return;
    const existing = await this.prisma.leadStageHistory.findFirst({ where: { leadId }, orderBy: { enteredAt: 'desc' } });
    if (existing) return;
    const closed = lead.crmClosedAt;
    await this.prisma.leadStageHistory.create({
      data: {
        leadId, stageId: lead.currentStageId, enteredAt: lead.crmCreatedAt, exitedAt: closed,
        durationSeconds: closed ? Math.floor((closed.getTime() - lead.crmCreatedAt.getTime()) / 1000) : null,
      },
    });
  }
}
