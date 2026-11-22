// src/cart/cart.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddCartItemDto } from './dto/addCartItem.dto.js';
import { UpdateCartItemDto } from './dto/updateCartItem.dto.js';

@Injectable()
export class CartService {
    constructor(private readonly prisma: PrismaService) {}

    
    async addItem(userId: string, dto: AddCartItemDto) {
        const quantityToAdd = dto.quantity ?? 1;

        if (quantityToAdd < 1) {
            throw new BadRequestException('Quantity must be at least 1');
        }

        // 1. Validate product and determine whether it has variants
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: {
                variants: {
                    select: {
                        id: true
                    },
                    take: 1,
                },
            },
        });

        if (!product || !product.isActive || product.isArchived) {
            throw new NotFoundException('Product not found or unavailable');
        }

        if (product.variants.length > 0 && !dto.variantId) {
            throw new BadRequestException(
                'Please select a product variant',
            );
        }

        if (product.variants.length === 0 && dto.variantId) {
            throw new BadRequestException(
                'This product does not have variants',
            );
        }

        // 2. Ensure the user has a cart
        const cart = await this.prisma.cart.upsert({
            where: { userId },
            create: { userId },
            update: {},
        });

        // 3. Serialize concurrent modifications to this cart
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM "Cart"
                WHERE id = ${cart.id}
                FOR UPDATE
            `;

            let currentStock: number;

            // 4. Revalidate product/variant and retrieve fresh stock
            if (dto.variantId) {
                const variant = await tx.productVariant.findFirst({
                    where: {
                        id: dto.variantId,
                        productId: product.id,
                    },
                    select: {
                        stock: true,
                        isActive: true,
                        product: {
                            select: {
                                isActive: true,
                                isArchived: true,
                            },
                        },
                    },
                });

                if (
                    !variant ||
                    !variant.isActive ||
                    !variant.product.isActive ||
                    variant.product.isArchived
                ) {
                    throw new NotFoundException(
                        'Product variant not found or unavailable',
                    );
                }

                currentStock = variant.stock;
            } else {
                const freshProduct = await tx.product.findUnique({
                    where: { id: product.id },
                    select: {
                        stock: true,
                        isActive: true,
                        isArchived: true,
                        variants: {
                            select: { id: true },
                            take: 1,
                        },
                    },
                });

                if (
                    !freshProduct ||
                    !freshProduct.isActive ||
                    freshProduct.isArchived
                ) {
                    throw new NotFoundException(
                        'Product not found or unavailable',
                    );
                }

                if (freshProduct.variants.length > 0) {
                    throw new BadRequestException(
                        'This product now requires a variant selection',
                    );
                }

                currentStock = freshProduct.stock ?? 0;
            }

            // 5. Check whether this item already exists in the cart
            const existingItem = await tx.cartItem.findFirst({
                where: {
                    cartId: cart.id,
                    productId: product.id,
                    variantId: dto.variantId ?? null,
                },
            });

            const newQuantity = existingItem
                ? existingItem.quantity + quantityToAdd
                : quantityToAdd;

            // 6. Validate the combined quantity against fresh stock
            if (newQuantity > currentStock) {
                throw new BadRequestException(
                    'Requested quantity exceeds available stock',
                );
            }

            // 7. Update existing item or create a new one
            if (existingItem) {
                return tx.cartItem.update({
                    where: { id: existingItem.id },
                    data: {
                        quantity: newQuantity,
                    },
                });
            }

            return tx.cartItem.create({
                data: {
                    cartId: cart.id,
                    productId: product.id,
                    variantId: dto.variantId ?? null,
                    quantity: quantityToAdd,
                },
            });
        });
    }

    async getCart(userId: string) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    orderBy: {
                        createdAt: 'desc',
                    },
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                                brand: true,
                                price: true,
                                currency: true,
                                images: {
                                    orderBy: {
                                        sortOrder: 'asc',
                                    },
                                },
                            },
                        },
                        variant: {
                            select: {
                                id: true,
                                sku: true,
                                price: true,
                                currency: true,
                                stock: true,
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
        });

        if (!cart) {
            return {
                id: null,
                items: [],
            };
        }

        return cart;
    }


    async updateItem(
        userId: string,
        itemId: string,
        dto: UpdateCartItemDto,
    ) {
        // 1. Find the customer's cart
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        // 2. Lock the cart to serialize concurrent modifications
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM "Cart"
                WHERE id = ${cart.id}
                FOR UPDATE
            `;

            // 3. Find the item and ensure it belongs to this cart
            const cartItem = await tx.cartItem.findFirst({
                where: {
                    id: itemId,
                    cartId: cart.id,
                },
                select: {
                    id: true,
                    productId: true,
                    variantId: true,
                },
            });

            if (!cartItem) {
                throw new NotFoundException('Cart item not found');
            }

            // 4. Validate current product/variant availability and stock
            let availableStock: number;

            if (cartItem.variantId) {
                const variant = await tx.productVariant.findFirst({
                    where: {
                        id: cartItem.variantId,
                        productId: cartItem.productId,
                    },
                    select: {
                        stock: true,
                        isActive: true,
                        product: {
                            select: {
                                isActive: true,
                                isArchived: true,
                            },
                        },
                    },
                });

                if (
                    !variant ||
                    !variant.isActive ||
                    !variant.product.isActive ||
                    variant.product.isArchived
                ) {
                    throw new BadRequestException(
                        'This product variant is no longer available',
                    );
                }

                availableStock = variant.stock;
            } else {
                const product = await tx.product.findUnique({
                    where: { id: cartItem.productId },
                    select: {
                        stock: true,
                        isActive: true,
                        isArchived: true,
                        variants: {
                            select: { id: true },
                            take: 1,
                        },
                    },
                });

                if (
                    !product ||
                    !product.isActive ||
                    product.isArchived
                ) {
                    throw new BadRequestException(
                        'This product is no longer available',
                    );
                }

                if (product.variants.length > 0) {
                    throw new BadRequestException(
                        'This product now requires a variant selection',
                    );
                }

                availableStock = product.stock ?? 0;
            }

            // 5. Check requested quantity against available stock
            if (dto.quantity > availableStock) {
                throw new BadRequestException(
                    'Requested quantity exceeds available stock',
                );
            }

            // 6. Update the cart item
            return tx.cartItem.update({
                where: { id: cartItem.id },
                data: {
                    quantity: dto.quantity,
                },
            });
        });
    }

    async removeItem(userId: string, itemId: string) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        return this.prisma.$transaction(async (tx) => {
            // Lock the customer's cart
            await tx.$queryRaw`
                SELECT id FROM "Cart"
                WHERE id = ${cart.id}
                FOR UPDATE
            `;

            // Ensure the item belongs to this customer's cart
            const cartItem = await tx.cartItem.findFirst({
                where: {
                    id: itemId,
                    cartId: cart.id,
                },
            });

            if (!cartItem) {
                throw new NotFoundException('Cart item not found');
            }

            // Remove the item
            await tx.cartItem.delete({
                where: { id: cartItem.id },
            });

            return {
                message: 'Cart item removed successfully',
            };
        });
    }

    async incrementItem(userId: string, itemId: string) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM "Cart"
                WHERE id = ${cart.id}
                FOR UPDATE
            `;

            const cartItem = await tx.cartItem.findFirst({
                where: {
                    id: itemId,
                    cartId: cart.id,
                },
                select: {
                    id: true,
                    productId: true,
                    variantId: true,
                    quantity: true,
                },
            });

            if (!cartItem) {
                throw new NotFoundException('Cart item not found');
            }

            let availableStock: number;

            if (cartItem.variantId) {
                const variant = await tx.productVariant.findFirst({
                    where: {
                        id: cartItem.variantId,
                        productId: cartItem.productId,
                    },
                    select: {
                        stock: true,
                        isActive: true,
                        product: {
                            select: {
                                isActive: true,
                                isArchived: true,
                            },
                        },
                    },
                });

                if (
                    !variant ||
                    !variant.isActive ||
                    !variant.product.isActive ||
                    variant.product.isArchived
                ) {
                    throw new BadRequestException(
                        'This product variant is no longer available',
                    );
                }

                availableStock = variant.stock;
            } else {
                const product = await tx.product.findUnique({
                    where: { id: cartItem.productId },
                    select: {
                        stock: true,
                        isActive: true,
                        isArchived: true,
                        variants: {
                            select: { id: true },
                            take: 1,
                        },
                    },
                });

                if (
                    !product ||
                    !product.isActive ||
                    product.isArchived
                ) {
                    throw new BadRequestException(
                        'This product is no longer available',
                    );
                }

                if (product.variants.length > 0) {
                    throw new BadRequestException(
                        'This product now requires a variant selection',
                    );
                }

                availableStock = product.stock ?? 0;
            }

            const newQuantity = cartItem.quantity + 1;

            if (newQuantity > availableStock) {
                throw new BadRequestException(
                    'Requested quantity exceeds available stock',
                );
            }

            return tx.cartItem.update({
                where: { id: cartItem.id },
                data: { quantity: newQuantity },
            });
        });
    }

    async decrementItem(userId: string, itemId: string) {
        const cart = await this.prisma.cart.findUnique({
            where: { userId },
            select: { id: true },
        });

        if (!cart) {
            throw new NotFoundException('Cart not found');
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id FROM "Cart"
                WHERE id = ${cart.id}
                FOR UPDATE
            `;

            const cartItem = await tx.cartItem.findFirst({
                where: {
                    id: itemId,
                    cartId: cart.id,
                },
                select: {
                    id: true,
                    quantity: true,
                },
            });

            if (!cartItem) {
                throw new NotFoundException('Cart item not found');
            }

            if (cartItem.quantity === 1) {
                await tx.cartItem.delete({
                    where: { id: cartItem.id },
                });

                return {
                    message: 'Cart item removed successfully',
                };
            }

            return tx.cartItem.update({
                where: { id: cartItem.id },
                data: {
                    quantity: {
                        decrement: 1,
                    },
                },
            });
        });
    }


}
