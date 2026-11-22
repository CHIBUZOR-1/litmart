// src/cart/cart.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddCartItemDto } from './dto/addCartItem.dto.js';

@Injectable()
export class CartService {
    constructor(private readonly prisma: PrismaService) {}

    async addItem(userId: string, dto: AddCartItemDto) {
        // Find the product and its variants
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
            include: {
                variants: {
                    where: { isActive: true },
                },
            },
        });

        if (!product || !product.isActive || product.isArchived) {
            throw new NotFoundException('Product not found or unavailable');
        }

        let stock: number;

        if (product.variants.length > 0) {
            if (!dto.variantId) {
                throw new BadRequestException(
                    'Please select a product variant',
                );
            }

            const variant = product.variants.find(
                (item) => item.id === dto.variantId,
            );

            if (!variant) {
                throw new NotFoundException(
                    'Product variant not found or unavailable',
                );
            }

            stock = variant.stock;
        } else {
            if (dto.variantId) {
                throw new BadRequestException(
                    'This product does not have variants',
                );
            }

            stock = product.stock ?? 0;
        }

        const quantity = dto.quantity ?? 1;

        if (stock < quantity) {
            throw new BadRequestException('Insufficient stock');
        }

        // Find or create the customer's cart
        const cart = await this.prisma.cart.upsert({
            where: { userId },
            create: { userId },
            update: {},
        });

        // Check whether this product/variant is already in the cart
        const existingItem = await this.prisma.cartItem.findFirst({
            where: {
                cartId: cart.id,
                productId: product.id,
                variantId: dto.variantId ?? null,
            },
        });

        const newQuantity = existingItem
            ? existingItem.quantity + quantity
            : quantity;

        if (newQuantity > stock) {
            throw new BadRequestException(
                'Requested quantity exceeds available stock',
            );
        }

        if (existingItem) {
            return this.prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: newQuantity },
            });
        }

        return this.prisma.cartItem.create({
            data: {
                cartId: cart.id,
                productId: product.id,
                variantId: dto.variantId ?? null,
                quantity,
            },
        });
    }
}
