// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateUserDto } from './dto/update.dto.js';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

  /**
   * Used by AuthService during registration and login
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Used by AuthService during registration
   */
  async create(data: { 
    email: string; 
    firstName: string; 
    lastName: string; 
    passwordHash: string; 
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash: data.passwordHash,
        role: 'CUSTOMER', // Default fallback matching your Prisma schema
      },
    });
  }

  /**
   * Used by UsersController to fetch personal customer profile details
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,       // Includes related addresses from your model
        cart: true,            // Includes active shopping cart
        wishlist: true,        // Includes user wishlist items
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    // Safely remove the hashed password string before sending it downstream
    const { passwordHash: _, hashedRefreshToken, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Used by UsersController to update personal information via Partial DTO mappings
   */
  async updateProfile(userId: string, dto: UpdateUserDto) {
    // Check if user exists first to ensure explicit errors
    const userExists = await this.prisma.user.findUnique({ 
        where: { id: userId },
        select: { id: true },
    });
    if (!userExists) {
      throw new NotFoundException('User profile not found');
    }

    // Clean up input fields if they are supplied
    const dataToUpdate: any = { ...dto };
    if (dto.firstName) dataToUpdate.firstName = dto.firstName.trim();
    if (dto.lastName) dataToUpdate.lastName = dto.lastName.trim();

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    const { passwordHash: _, ...safeUser } = updatedUser;
    return safeUser;
  }

  async updateRefreshToken(userId: string, hashedRefreshToken: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken }, // 👈 This should show no red squiggly lines now!
    });
  }

}
