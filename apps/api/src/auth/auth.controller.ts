// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { AccessGuard } from './guards/access.guard.js';
import { UsersService } from '../users/users.service.js';
import { VerifyEmailDto } from './dto/verifyEmail.dto.js';
import { ResendVerificationDto } from './dto/resendVerification.dto.js';
import { ForgotPasswordDto } from './dto/forgotPassword.dto.js';
import { ResetPasswordDto } from './dto/resetPassword.dto.js';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

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
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService, private readonly usersService: UsersService) {}
    @Post('register')
    @ApiOperation({ summary: 'Register a new customer account' })
    @ApiResponse({ status: 201, description: 'Account registered successfully' })
    @ApiResponse({ status: 400, description: 'Invalid registration data' })
    @ApiResponse({ status: 409, description: 'Email already exists' })
    async register( @Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Authenticate a customer and set authentication cookies' })
    @ApiResponse({ status: 200, description: 'Login successful; authentication cookies set' })
    @ApiResponse({ status: 401, description: 'Invalid credentials or account not eligible to log in' })
    async login( @Body() dto: LoginDto, @Res({ passthrough: true }) res: Response,) {
        const { accessToken, refreshToken, ...result } = await this.authService.login(dto);

        this.setAuthCookies(res, accessToken, refreshToken,);

        return result;
    }

    @Get('me')
    @UseGuards(AccessGuard)
    @ApiCookieAuth('accessToken')
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
    @ApiOperation({ summary: 'Refresh authentication tokens using the refresh cookie' })
    @ApiResponse({ status: 200, description: 'Tokens refreshed successfully; authentication cookies rotated' })
    @ApiResponse({ status: 401, description: 'Refresh token missing, invalid, or expired' })
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

    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify a customers email address' })
    @ApiResponse({ status: 200, description: 'Email verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or already used verification token' })
    async verifyEmail(@Body() dto: VerifyEmailDto) {
        return this.authService.verifyEmail(dto.token);
    }

    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend email verification instructions' })
    @ApiResponse({ status: 200, description: 'Verification request processed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid email address' })
    async resendVerification(@Body() dto: ResendVerificationDto) {
        return this.authService.resendVerificationEmail(dto.email);
    }

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request a password reset email' })
    @ApiResponse({ status: 200, description: 'Password reset request processed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid email address' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset a customers password using a reset token' })
    @ApiResponse({ status: 200, description: 'Password reset successfully' })
    @ApiResponse({ status: 400, description: 'Invalid, expired, or already used reset token' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto.token, dto.newPassword);
    }

    @Post('logout')
    @UseGuards(AccessGuard)
    @ApiCookieAuth('accessToken')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Log out the authenticated customer and clear authentication cookies' })
    @ApiResponse({ status: 200, description: 'Logout successful' })
    @ApiResponse({ status: 401, description: 'Authentication required' })
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
