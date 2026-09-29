import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [PrismaModule, CryptoModule, UserModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}

