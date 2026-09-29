import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export const QUEUE_NAME = 'sync';
export const QUEUE_BACKFILL_NAME = 'backfill';

@Injectable()
export class JobSchedulerService implements OnModuleInit {
  private logger = new Logger('JobScheduler');

  constructor(
    @InjectQueue(QUEUE_NAME) private queue: Queue,
    @InjectQueue(QUEUE_BACKFILL_NAME) private backfillQueue: Queue,
  ) {}

  async onModuleInit() {
    const syncEveryMinutes = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10', 10);
    try {
      const repeatable = await this.queue.getRepeatableJobs();
      for (const r of repeatable) {
        if (['pipeline-sync-cron', 'token-expiry-cron', 'delta-sync-cron'].includes(r.id || r.name || '')) {
          await this.queue.removeRepeatableByKey(r.key);
        }
      }
    } catch (e) {
      this.logger.warn(`Could not clear old repeatable jobs: ${e}`);
    }

    try {
      await this.queue.add(
        'pipeline-sync-cron',
        { type: 'pipeline-sync-cron' },
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'pipeline-sync-cron' },
      );
      await this.queue.add(
        'token-expiry-cron',
        { type: 'token-expiry-cron' },
        { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'token-expiry-cron' },
      );
      await this.queue.add(
        'delta-sync-cron',
        { type: 'delta-sync-cron' },
        { repeat: { every: syncEveryMinutes * 60 * 1000 }, jobId: 'delta-sync-cron' },
      );
    } catch (e) {
      this.logger.error(`Could not schedule cron jobs: ${e}`);
    }
  }

  private async prepareJobSlot(q: Queue, jobId: string, allowedStates = ['completed', 'failed']) {
    try {
      const existing = await q.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (allowedStates.includes(state)) {
          await existing.remove();
        }
      }
    } catch (e) {
      this.logger.warn(`Could not prepare slot for job ${jobId}: ${e}`);
    }
  }

  async startBackfill(accountId: number) {
    const jobId = `backfill-${accountId}`;
    await this.prepareJobSlot(this.backfillQueue, jobId, ['completed', 'failed', 'waiting', 'delayed']);
    return this.backfillQueue.add(
      'backfill',
      { accountId, type: 'backfill' },
      { jobId, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  async triggerSync(accountId: number) {
    const jobId = `delta-${accountId}`;
    await this.prepareJobSlot(this.queue, jobId, ['completed', 'failed']);
    return this.queue.add(
      'delta',
      { accountId, type: 'delta' },
      { jobId, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  async triggerPipelineSync(accountId: number) {
    const jobId = `pipeline-${accountId}`;
    await this.prepareJobSlot(this.queue, jobId, ['completed', 'failed']);
    return this.queue.add(
      'pipeline',
      { accountId, type: 'pipeline' },
      { jobId, removeOnComplete: true, removeOnFail: 100 },
    );
  }

  async stopAccountJobs(accountId: number) {
    for (const q of [this.queue, this.backfillQueue]) {
      try {
        const jobs = await q.getJobs(['waiting', 'delayed', 'failed', 'completed']);
        for (const j of jobs) {
          if (j.data?.accountId === accountId) {
            try {
              await j.remove();
            } catch (e) {
              this.logger.warn(`Could not remove job ${j.id}: ${e}`);
            }
          }
        }
      } catch (e) {
        this.logger.error(`Error stopping jobs for account ${accountId}: ${e}`);
      }
    }
  }
}
