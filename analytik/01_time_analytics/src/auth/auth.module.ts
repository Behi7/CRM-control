import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_ACCESS_SECRET!, signOptions: { expiresIn: '30d' } }) }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [PassportModule, JwtModule, JwtStrategy, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

