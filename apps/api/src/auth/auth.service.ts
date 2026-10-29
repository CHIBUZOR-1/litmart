// src/auth/auth.service.ts
import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js'; // Assuming you have this DTO
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
    constructor(
        private readonly usersService: UsersService, 
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
        await this.usersService.create({
            email,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            passwordHash,
        });
        return {
            message: 'Registration successful',
            status: 'ok'
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

        if (!user || !user.isActive || !user.hashedRefreshToken) {
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
}