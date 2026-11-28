import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCouponDto } from './dto/createCoupon.dto.js';
import { DiscountType } from '../generated/prisma/enums.js';
import { UpdateCouponDto } from './dto/updateCoupon.dto.js';
import { UpdateCouponStatusDto } from './dto/updateCouponStatus.dto.js';
import { ValidateCouponDto } from './dto/validateCoupon.dto.js';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class CouponService {
    constructor( private readonly prisma: PrismaService) {}

    // Create a coupon
    async create(dto: CreateCouponDto) {
        const code = dto.code.trim().toUpperCase();

        // Validate percentage discount
        if (
            dto.discountType === DiscountType.PERCENTAGE &&
            dto.discountValue > 100
        ) {
            throw new BadRequestException(
                'Percentage discount cannot exceed 100%',
            );
        }

        // Validate date range
        const startsAt = dto.startsAt
            ? new Date(dto.startsAt)
            : undefined;

        const expiresAt = dto.expiresAt
            ? new Date(dto.expiresAt)
            : undefined;

        if (
            startsAt &&
            expiresAt &&
            expiresAt <= startsAt
        ) {
            throw new BadRequestException(
                'Expiration date must be later than the start date',
            );
        }

        // Check for duplicate coupon code
        const existingCoupon = await this.prisma.coupon.findUnique({
            where: { code },
            select: { id: true },
        });

        if (existingCoupon) {
            throw new ConflictException(
                'A coupon with this code already exists',
            );
        }

        return this.prisma.coupon.create({
            data: {
                code,
                description: dto.description,
                discountType: dto.discountType,
                discountValue: dto.discountValue,
                minOrderAmount: dto.minOrderAmount,
                maxUses: dto.maxUses,
                startsAt,
                expiresAt,
            },
        });
    }

    // Get all coupons
    async findAll() {
        return this.prisma.coupon.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    // Get a single coupon
    async findOne(couponId: string) {
        const coupon = await this.prisma.coupon.findUnique({
            where: {
                id: couponId,
            },
        });

        if (!coupon) {
            throw new NotFoundException('Coupon not found');
        }

        return coupon;
    }

    // Update a coupon
    async update(couponId: string, dto: UpdateCouponDto) {
        const existingCoupon = await this.prisma.coupon.findUnique({
            where: { id: couponId },
        });

        if (!existingCoupon) {
            throw new NotFoundException('Coupon not found');
        }

        // Prevent changes to core discount rules after usage
        if (existingCoupon.usedCount > 0) {
            if (
                dto.code !== undefined ||
                dto.discountType !== undefined ||
                dto.discountValue !== undefined
            ) {
                throw new BadRequestException(
                    'Cannot change the coupon code or discount rules after the coupon has been used',
                );
            }
        }

        // Normalize coupon code when supplied
        const code = dto.code?.trim().toUpperCase();

        // Validate percentage discount
        const discountType = dto.discountType ?? existingCoupon.discountType;
        const discountValue = dto.discountValue ?? Number(existingCoupon.discountValue);

        if (
            discountType === DiscountType.PERCENTAGE &&
            discountValue > 100
        ) {
            throw new BadRequestException(
                'Percentage discount cannot exceed 100%',
            );
        }

        // Validate date range using updated values or existing values
        const startsAt = dto.startsAt !== undefined
            ? new Date(dto.startsAt)
            : existingCoupon.startsAt;

        const expiresAt = dto.expiresAt !== undefined
            ? new Date(dto.expiresAt)
            : existingCoupon.expiresAt;

        if (startsAt && expiresAt && expiresAt <= startsAt) {
            throw new BadRequestException(
                'Expiration date must be later than the start date',
            );
        }

        // Check whether the new code is already in use
        if (code && code !== existingCoupon.code) {
            const duplicate = await this.prisma.coupon.findUnique({
                where: { code },
                select: { id: true },
            });

            if (duplicate) {
                throw new ConflictException(
                    'A coupon with this code already exists',
                );
            }
        }

        return this.prisma.coupon.update({
            where: { id: couponId },
            data: {
                ...(code !== undefined && { code }),
                ...(dto.description !== undefined && {
                    description: dto.description,
                }),
                ...(dto.discountType !== undefined && {
                    discountType: dto.discountType,
                }),
                ...(dto.discountValue !== undefined && {
                    discountValue: dto.discountValue,
                }),
                ...(dto.minOrderAmount !== undefined && {
                    minOrderAmount: dto.minOrderAmount,
                }),
                ...(dto.maxUses !== undefined && {
                    maxUses: dto.maxUses,
                }),
                ...(dto.startsAt !== undefined && { startsAt }),
                ...(dto.expiresAt !== undefined && { expiresAt }),
            },
        });
    }

    // Update coupon active status
    async updateStatus(
        couponId: string,
        dto: UpdateCouponStatusDto,
    ) {
        const coupon = await this.prisma.coupon.findUnique({
            where: { id: couponId },
            select: { id: true },
        });

        if (!coupon) {
            throw new NotFoundException('Coupon not found');
        }

        return this.prisma.coupon.update({
            where: { id: couponId },
            data: {
                isActive: dto.isActive,
            },
        });
    }

    // Delete a coupon
    async remove(couponId: string) {
        const coupon = await this.prisma.coupon.findUnique({
            where: { id: couponId },
            select: {
                id: true,
                usedCount: true,
            },
        });

        if (!coupon) {
            throw new NotFoundException('Coupon not found');
        }

        if (coupon.usedCount > 0) {
            throw new ConflictException(
                'This coupon has been used and cannot be deleted. Deactivate it instead.',
            );
        }

        await this.prisma.coupon.delete({
            where: { id: couponId },
        });

        return {
            message: 'Coupon deleted successfully',
        };
    }

    public async calculateCouponDiscount(
        code: string,
        subtotal: number,
        tx: Prisma.TransactionClient = this.prisma,
    ) {
        const normalizedCode = code.trim().toUpperCase();
        const now = new Date();

        const coupon = await tx.coupon.findUnique({
            where: { code: normalizedCode },
        });

        if (!coupon) {
            throw new NotFoundException('Coupon code not found');
        }

        if (!coupon.isActive) {
            throw new BadRequestException(
                'This coupon is no longer active',
            );
        }

        if (coupon.startsAt && now < coupon.startsAt) {
            throw new BadRequestException(
                'This coupon is not available yet',
            );
        }

        if (coupon.expiresAt && now >= coupon.expiresAt) {
            throw new BadRequestException(
                'This coupon has expired',
            );
        }

        if (
            coupon.maxUses !== null &&
            coupon.usedCount >= coupon.maxUses
        ) {
            throw new BadRequestException(
                'This coupon usage limit has been reached',
            );
        }

        if (
            !Number.isFinite(subtotal) ||
            subtotal < 0
        ) {
            throw new BadRequestException('Invalid order subtotal');
        }

        if (
            coupon.minOrderAmount !== null &&
            subtotal < Number(coupon.minOrderAmount)
        ) {
            throw new BadRequestException(
                `A minimum order amount of ${coupon.minOrderAmount} is required`,
            );
        }

        const discountValue = Number(coupon.discountValue);

        if (
            !Number.isFinite(discountValue) ||
            discountValue <= 0 ||
            (
                coupon.discountType === DiscountType.PERCENTAGE &&
                discountValue > 100
            )
        ) {
            throw new BadRequestException('Invalid coupon discount');
        }

        let discountAmount =
            coupon.discountType === DiscountType.PERCENTAGE
                ? (subtotal * discountValue) / 100
                : discountValue;

        discountAmount = Math.min(discountAmount, subtotal);

        discountAmount = Math.round(
            (discountAmount + Number.EPSILON) * 100,
        ) / 100;

        return {
            coupon,
            discountAmount,
        };
    }

    async validateCoupon(dto: ValidateCouponDto) {
        const { coupon, discountAmount } =
            await this.calculateCouponDiscount(
                dto.code,
                dto.subtotal,
            );

        const totalAfterDiscount = Math.round(
            (dto.subtotal - discountAmount + Number.EPSILON) * 100,
        ) / 100;

        return {
            couponId: coupon.id,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            subtotal: dto.subtotal,
            discountAmount,
            totalAfterDiscount,
        };
    }
}
