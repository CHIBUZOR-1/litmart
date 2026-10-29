// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { AccessGuard } from './guards/access.guard.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({}),
  ],
  providers: [AuthService, AccessGuard],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
