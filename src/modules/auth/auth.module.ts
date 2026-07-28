import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenCleanupService } from './token-clenup.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JwtModule tanpa secret global — secret dipakai per sign/verify
    // agar access dan refresh token punya secret berbeda
    JwtModule.register({}),

    // Untuk scheduled token cleanup
    ScheduleModule.forRoot(),
  ],
  providers: [AuthService, JwtStrategy, TokenCleanupService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
