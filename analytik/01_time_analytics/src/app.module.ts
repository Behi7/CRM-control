import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validateConfig } from './common/config/config.validate';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: {
      level: process.env.APP_ENV === 'production' ? 'info' : 'debug',
      redact: ['req.headers.authorization','req.headers.cookie','body.password','body.token','body.refreshToken','body.encrypted_token','*.password','*.token','*.encrypted_token'],
      autoLogging: true,
    }}),
    ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    PrismaModule,
    CryptoModule,
    AuthModule,
    UserModule,
    AiModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

