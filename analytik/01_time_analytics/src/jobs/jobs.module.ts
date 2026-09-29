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
    JobsBootstrapService,
    EventProcessor,
    DeltaSyncProcessor,
    PipelineSyncProcessor,
    BackfillProcessor,
    TokenExpiryProcessor,
    SyncWorker,
    BackfillWorker,
  ],
  exports: [JobSchedulerService],
})
export class JobsModule {}
