import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { CrmConnectorModule } from './crm-connector/crm-connector.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://redis:6379',
      },
    }),
    PrismaModule,
    CryptoModule,
    CrmConnectorModule,
    JobsModule,
    AuthModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
