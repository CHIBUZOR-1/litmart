import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddWishlistItemDto } from './dto/addWishlistItem.dto.js';

@Injectable()
export class WishlistService {
    constructor(private readonly prisma: PrismaService) {}

    async addItem(userId: string, dto: AddWishlistItemDto) {
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            select: {
                id: true,
                isActive: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        if (!product.isActive || product.isArchived) {
            throw new BadRequestException(
                'This product is currently unavailable',
            );
        }

        // Create the wishlist if it doesn't already exist.
        const wishlist = await this.prisma.wishlist.upsert({
            where: { userId },
            update: {},
            create: { userId },
            select: { id: true },
        });

        // Prevent duplicate products in the same wishlist.
        return this.prisma.wishlistItem.upsert({
            where: {
                wishlistId_productId: {
                    wishlistId: wishlist.id,
                    productId: product.id,
                },
            },
            update: {},
            create: {
                wishlistId: wishlist.id,
                productId: product.id,
            },
        });
    }

    async getWishlist(userId: string) {
        const wishlist = await this.prisma.wishlist.findUnique({
            where: { userId },
            include: {
                items: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    include: {
                        product: {
                            include: {
                                images: {
                                    orderBy: {
                                        sortOrder: 'asc',
                                    },
                                },
                                variants: {
                                    where: {
                                        isActive: true,
                                    },
                                    orderBy: {
                                        createdAt: 'desc',
                                    },
                                    include: {
                                        attributes: {
                                            include: {
                                                attributeValue: {
                                                    include: {
                                                        attribute: true,
                                                    },
                                                },
                                            },
                                        },
                                        images: {
                                            orderBy: {
                                                sortOrder: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!wishlist) {
            return {
                id: null,
                items: [],
            };
        }

        return wishlist;
    }

    async removeItem(userId: string, itemId: string) {
        const wishlist = await this.prisma.wishlist.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!wishlist) {
            throw new NotFoundException('Wishlist not found');
        }

        const wishlistItem = await this.prisma.wishlistItem.findFirst({
            where: {
                id: itemId,
                wishlistId: wishlist.id,
            },
            select: {
                id: true,
            },
        });

        if (!wishlistItem) {
            throw new NotFoundException('Wishlist item not found');
        }

        await this.prisma.wishlistItem.delete({
            where: {
                id: wishlistItem.id,
            },
        });

        return {
            message: 'Wishlist item removed successfully',
        };
    }

    
}
