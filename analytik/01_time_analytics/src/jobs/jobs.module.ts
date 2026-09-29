import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobSchedulerService, QUEUE_NAME, QUEUE_BACKFILL_NAME } from './job-scheduler.service';
import { JobsBootstrapService } from './jobs-bootstrap.service';
import { DeltaSyncProcessor } from './processors/delta-sync.processor';
import { PipelineSyncProcessor } from './processors/pipeline-sync.processor';
import { BackfillProcessor } from './processors/backfill.processor';
import { TokenExpiryProcessor } from './processors/token-expiry.processor';
import { EventProcessor } from './processors/event.processor';
import { SyncWorker, BackfillWorker } from './sync.worker';

const isWorkerEnabled = process.env.SYNC_WORKER_ENABLED !== 'false';

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAME },
      { name: QUEUE_BACKFILL_NAME },
    ),
  ],
  providers: [
    JobSchedulerService,
    EventProcessor,
    DeltaSyncProcessor,
    PipelineSyncProcessor,
    BackfillProcessor,
    TokenExpiryProcessor,
    ...(isWorkerEnabled ? [JobsBootstrapService, SyncWorker, BackfillWorker] : []),
  ],
  exports: [JobSchedulerService, DeltaSyncProcessor],
})
export class JobsModule {}
