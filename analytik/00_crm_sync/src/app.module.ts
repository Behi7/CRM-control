import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { CrmConnectorModule } from './crm-connector/crm-connector.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    CrmConnectorModule,
    JobsModule,
  ],
})
export class AppModule {}
