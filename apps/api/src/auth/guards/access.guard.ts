// src/auth/guards/access.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

type AccessTokenPayload = {
  sub: string;
  role: string;
};

type AuthenticatedRequest = Request & {
  cookies?: Record<string, string>;
  user?: AccessTokenPayload;
};

@Injectable()
export class AccessGuard implements CanActivate {
  constructor( private readonly jwt: JwtService, private readonly config: ConfigService, ) {}
  async canActivate(context: ExecutionContext,): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const accessToken = request.cookies?.accessToken;

    if (!accessToken) {
      throw new UnauthorizedException('Authentication required');
    }

    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken, {
          secret,
        });

      if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.role !== 'string' || !payload.role ) {
        throw new UnauthorizedException('Invalid access token');
      }
      request.user = {
        sub: payload.sub,
        role: payload.role,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid or expired access token',
      );
    }
  }
}
