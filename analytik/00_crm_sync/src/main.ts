import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('CrmSyncMicroservice');
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  logger.log('🚀 00_crm_sync standalone worker microservice started (10-min delta-sync + BI enrichment active)');
}

bootstrap();
