// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { AccessGuard } from './guards/access.guard.js';
import { UsersService } from '../users/users.service.js';

const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

type AuthenticatedRequest = Request & {
  user?: {
    sub: string;
    role: string;
  };
};

/*
For single access token
const COOKIE_NAME = 'jwt';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day
*/

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService, private readonly usersService: UsersService) {}
    @Post('register')
    async register( @Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login( @Body() dto: LoginDto, @Res({ passthrough: true }) res: Response,) {
        const { accessToken, refreshToken, ...result } = await this.authService.login(dto);

        this.setAuthCookies(res, accessToken, refreshToken,);

        return result;
    }

    @Get('me')
    @UseGuards(AccessGuard)
    async me(@Req() req: AuthenticatedRequest) {
        const userId = req.user?.sub;

        if (!userId) {
            throw new UnauthorizedException('Authentication required');
        }

        return this.usersService.getProfile(userId);
    }

      // Refresh: validate the refresh cookie and rotate both tokens.
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(
        @Req() req: Request & { cookies?: Record<string, string> },
        @Res({ passthrough: true }) res: Response,
    ) {
        const refreshToken = req.cookies?.[REFRESH_COOKIE];

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token is missing');
        }

        const tokens = await this.authService.refreshTokens(refreshToken);

        this.setAuthCookies(
            res,
            tokens.accessToken,
            tokens.refreshToken,
        );

        return {
            message: 'Tokens refreshed successfully',
        };
    }

    @Post('logout')
    @UseGuards(AccessGuard)
    @HttpCode(HttpStatus.OK)
    async logout( @Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response ) {
        const userId = req.user?.sub;

        if (!userId) {
            throw new UnauthorizedException('Authentication required');
        }
        await this.authService.logout(userId);

        this.clearAuthCookies(res);

        return {
            message: 'Logout successful',
        };
    }

    private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
        const commonOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/',
        };

        res.cookie(ACCESS_COOKIE, accessToken, {
            ...commonOptions,
            maxAge: ACCESS_COOKIE_MAX_AGE,
        });

        res.cookie(REFRESH_COOKIE, refreshToken, {
            ...commonOptions,
            maxAge: REFRESH_COOKIE_MAX_AGE,
        });
    }

    private clearAuthCookies(res: Response): void {
        const commonOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/',
        };

        res.clearCookie(ACCESS_COOKIE, commonOptions);
        res.clearCookie(REFRESH_COOKIE, commonOptions);
    }
}
