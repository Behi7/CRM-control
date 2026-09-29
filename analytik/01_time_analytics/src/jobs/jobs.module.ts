import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobSchedulerService, QUEUE_NAME, QUEUE_BACKFILL_NAME } from './job-scheduler.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAME },
      { name: QUEUE_BACKFILL_NAME },
    ),
  ],
  providers: [JobSchedulerService],
  exports: [JobSchedulerService],
})
export class JobsModule {}
