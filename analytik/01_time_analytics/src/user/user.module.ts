import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AccountOwnershipGuard } from './guards/ownership.guard';
@Module({
  controllers: [UserController],
  providers: [UserService, AccountOwnershipGuard],
  exports: [UserService, AccountOwnershipGuard],
})
export class UserModule {}
