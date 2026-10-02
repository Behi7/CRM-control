import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';

(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const logger = new Logger('CoreSyncService');
  const app = await NestFactory.create(AppModule);
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', 1);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  logger.log(`🚀 00_core_sync HTTP API + BullMQ Background Workers active on port ${port}`);
}

bootstrap();
