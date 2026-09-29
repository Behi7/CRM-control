import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { CrmConnectorModule } from './crm-connector/crm-connector.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://redis:6379',
      },
    }),
    PrismaModule,
    CryptoModule,
    CrmConnectorModule,
    JobsModule,
  ],
})
export class AppModule {}
