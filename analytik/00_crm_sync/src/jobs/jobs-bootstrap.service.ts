import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { JobSchedulerService } from './job-scheduler.service';

@Injectable()
export class JobsBootstrapService implements OnModuleInit {
  private logger = new Logger('JobsBootstrap');

  constructor(private prisma: PrismaService, private scheduler: JobSchedulerService) {}

  async onModuleInit() {
    try {
      const accounts = await this.prisma.account.findMany({
        where: { status: 'connected', syncStatus: 'active' },
      });
      for (const a of accounts) {
        if (['pending', 'in_progress'].includes(a.backfillStatus)) {
          await this.scheduler.startBackfill(a.id);
          this.logger.log(`Restarted backfill for account ${a.id}`);
        } else if (a.backfillStatus === 'done') {
          const enrichedCount = await this.prisma.lead.count({
            where: { accountId: a.id, NOT: { customFields: { equals: null as any } } },
          });
          const totalCount = await this.prisma.lead.count({ where: { accountId: a.id } });
          if (totalCount > 0 && enrichedCount === 0) {
            await this.scheduler.triggerEnrich(a.id);
            this.logger.log(`Scheduled initial BI enrichment for account ${a.id} (${a.subdomain}, ${totalCount} leads)`);
          }
        }
      }
    } catch (e: any) {
      this.logger.error(`Error during JobsBootstrapService initialization: ${e?.message || e}`);
    }
  }
}
