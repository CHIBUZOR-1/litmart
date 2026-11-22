// src/auth/auth.service.ts
import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js'; // Assuming you have this DTO
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService, 
        private readonly emailService: EmailService,
        private readonly jwt: JwtService, 
        private readonly config: ConfigService,
    ) {}
    
    async register(dto: RegisterDto) {
        // 1. Check if the email is already taken
        const email = dto.email.trim().toLowerCase();
        const existingUser = await this.usersService.findByEmail(email);

        if (existingUser) {
            throw new ConflictException('Email is already registered');
        }

        // 2. Hash the raw password before saving
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(dto.password, saltRounds);

        // 3. Delegate user creation to the UsersService
        const user = await this.usersService.create({
            email,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            passwordHash,
        });

        // Generate a secure verification token.
        //const verificationToken = randomBytes(32).toString('hex');
        const verificationToken = randomInt(100000, 1000000).toString();
        // Store only its SHA-256 hash.
        const tokenHash = this.hashToken(verificationToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.usersService.saveVerificationToken(
          user.id,
          tokenHash,
          expiresAt,
        );

        // Send the original token through Brevo.
        await this.emailService.sendVerificationEmail(
            user.email,
            user.firstName,
            verificationToken,
        );
        return {
            message: 'Registration successful',
            status: 'ok'
        };
    }
    // VERIFY EMAIL 
    async verifyEmail(token: string) {
        if (!token) {
            throw new BadRequestException('Verification token is required');
        }
        const tokenHash = this.hashToken(token);
        const user = await this.usersService.findByVerificationToken(tokenHash);
        if (!user) {
            throw new BadRequestException(
                'Invalid or expired verification token',
            );
        }
        if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt <= new Date()) {
            throw new BadRequestException(
                'Invalid or expired verification token',
            );
        }
        if (user.isEmailVerified) {
            throw new BadRequestException('Email is already verified');
        }

        await this.usersService.verifyEmail(user.id);
        
        await this.emailService.sendVerifiedEmail(
            user.email,
            user.firstName
        );

        return {
            message: 'Email verified successfully. You can now log in.',
            status: 'ok',
        };
    }
      // RESEND VERIFICATION EMAIL
    async resendVerificationEmail(email: string) {
        const normalizedEmail = email.trim().toLowerCase();

        const user = await this.usersService.findByEmail(normalizedEmail);

        if (!user || user.isEmailVerified || !user.isActive) {
        return {
            message:
            'If an eligible account exists, a verification email will be sent.',
            status: 'ok',
        };
        }

        const verificationToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(verificationToken);

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.usersService.saveVerificationToken(
            user.id,
            tokenHash,
            expiresAt,
        );

        await this.emailService.sendVerificationEmail(
            user.email,
            user.firstName,
            verificationToken,
        );

        return {
            message: 'If an eligible account exists, a verification email will be sent.',
            status: 'ok',
        };
    }

    async login(dto: LoginDto) {
        // 1. Find the user by their email
        const email = dto.email.trim().toLowerCase();
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // 2. Compare the raw password with the stored hash
        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // 3. Check whether the account is active
        if (!user.isActive) {
            throw new UnauthorizedException('This account is inactive');
        }

        if (!user.isEmailVerified) {
            throw new UnauthorizedException(
                'Please verify your email before logging in',
            );
        }

        // 3. Generate and return the JWT token
        const tokens = await this.generateTokens(user.id, user.role);

        // Store only the hashed refresh token in the database.
        await this.saveRefreshToken(user.id, tokens.refreshToken);

        return {
            message: 'Login successful',
            ...tokens,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

      // FORGOT PASSWORD
    async forgotPassword(email: string) {
        const normalizedEmail = email.trim().toLowerCase();

        const user = await this.usersService.findByEmail(normalizedEmail);

        // Don't reveal whether an email address is registered.
        if (!user || !user.isActive || !user.isEmailVerified) {
            return {
                message: 'If an eligible account exists, a password-reset email will be sent.',
                status: 'ok',
            };
        }

        const resetToken = randomBytes(32).toString('hex');
        const tokenHash = this.hashToken(resetToken);

        // Reset token expires after 15 minutes.
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await this.usersService.savePasswordResetToken(
            user.id,
            tokenHash,
            expiresAt,
        );

        const origin = this.config.get<string>('ORIGIN');

            if (!origin) {
            throw new Error('ORIGIN is not configured');
        }

        const resetUrl = `${origin.replace(/\/$/, '')}/litmart/password-reset/${resetToken}`;

        await this.emailService.sendPasswordResetEmail(
            user.email,
            user.firstName,
            resetUrl,
        );

        return {
            message: 'If an eligible account exists, a password-reset email will be sent.',
            status: 'ok',
        };
    }

    // RESET PASSWORD
    async resetPassword(token: string, newPassword: string) {
        if (!token || !newPassword) {
            throw new BadRequestException(
                'Reset token and new password are required',
            );
        }

        const tokenHash = this.hashToken(token);

        const user = await this.usersService.findByPasswordResetToken(tokenHash);

        if (!user) {
            throw new BadRequestException(
                'Invalid or expired password-reset token',
            );
        }

        if (!user.resetPasswordTokenExpiresAt || user.resetPasswordTokenExpiresAt <= new Date()) {
            throw new BadRequestException(
                'Invalid or expired password-reset token',
            );
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await this.usersService.resetPassword(user.id, passwordHash);

        return {
            message: 'Password reset successfully. Please log in again.',
            status: 'ok',
        };
    }

    // 4. LOGOUT
    async logout(userId: string) {
        // Revoke the active refresh token for this user.
        await this.usersService.updateRefreshToken(userId, null);

        return {
            message: 'Logout successful',
        };
    }

    // 3. REFRESH TOKENS
    async refreshTokens(refreshToken: string) {
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token is required');
        }

        let payload: { sub: string };
        // Verify the refresh token's signature and expiration.
        try {
            payload = await this.jwt.verifyAsync<{ sub: string }>(
                refreshToken,
                {
                    secret: this.getRequiredSecret('JWT_REFRESH_SECRET'),
                },
            );
        } catch {
            throw new UnauthorizedException(
                'Invalid or expired refresh token',
            );
        }
        if (typeof payload.sub !== 'string' || !payload.sub) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.usersService.findById(payload.sub);

        if (!user || !user.isActive || !user.isEmailVerified || !user.hashedRefreshToken) {
            throw new UnauthorizedException('Invalid refresh session');
        }
        // Compare the supplied token against the stored hash.
        const tokenMatches = await bcrypt.compare(
            refreshToken,
            user.hashedRefreshToken,
        );

        if (!tokenMatches) {
            throw new UnauthorizedException('Invalid refresh session');
        }

        // Generate a new token pair using the user's current database role.
        const tokens = await this.generateTokens(user.id, user.role);

        // Rotate the refresh token: invalidate the old token.
        await this.saveRefreshToken(user.id, tokens.refreshToken);

        return tokens;
    }

    // 5. SAVE A HASHED REFRESH TOKEN
    private async saveRefreshToken( userId: string, refreshToken: string, ): Promise<void> {
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

        await this.usersService.updateRefreshToken(
            userId,
            hashedRefreshToken,
        );
    }

    private async generateTokens(userId: string, role: string) {
        const payload = { sub: userId, role };
        const accessSecret = this.getRequiredSecret('JWT_ACCESS_SECRET');
        const refreshSecret = this.getRequiredSecret('JWT_REFRESH_SECRET');
        const [accessToken, refreshToken] = await Promise.all([
            this.jwt.signAsync(payload, {
                secret: accessSecret,
                expiresIn: '15m',
            }),
            this.jwt.signAsync(payload, {
                secret: refreshSecret,
                expiresIn: '7d',
            }),
        ]);
        return { accessToken, refreshToken}
    }

    // 7. ENSURE SECRETS ARE CONFIGURED
    private getRequiredSecret(key: string): string {
        const secret = this.config.get<string>(key);

        if (!secret) {
            throw new Error(`${key} is not configured`);
        }

        return secret;
    }
    // HASH TOKENS
    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }
}