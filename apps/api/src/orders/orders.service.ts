// src/orders/orders.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { Currency } from '../generated/prisma/enums.js';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service.js';
import { CouponService } from '../coupon/coupon.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateOrderDto } from './dto/createOrder.dto.js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class OrdersService {
    constructor( 
        private readonly prisma: PrismaService, 
        private readonly configService: ConfigService, 
        private readonly exchangeRatesService: ExchangeRatesService, 
        private readonly couponService: CouponService,
    ) {}

    private getShippingFee(currency: Currency): number {
        const key =
            currency === Currency.NGN
                ? 'SHIPPING_FEE_NGN'
                : 'SHIPPING_FEE_USD';

        const fee = Number(this.configService.getOrThrow<string>(key));

        if (!Number.isFinite(fee) || fee < 0) {
            throw new BadRequestException(
                `Invalid shipping configuration for ${currency}`,
            );
        }

        return fee;
    }

    private async getExchangeRate(currency: Currency): Promise<number> {
        if (currency === Currency.USD) {
            return 1;
        }

        const exchangeRate = await this.exchangeRatesService.findCurrent();
        const rate = Number(exchangeRate.rate);

        if (!Number.isFinite(rate) || rate <= 0) {
            throw new BadRequestException(
                'Invalid exchange rate configuration',
            );
        }

        return rate;
    }

    private convertAmount(
        amountInUsd: number,
        exchangeRate: number,
    ): number {
        if (
            !Number.isFinite(amountInUsd) ||
            amountInUsd < 0 ||
            !Number.isFinite(exchangeRate) ||
            exchangeRate <= 0
        ) {
            throw new BadRequestException(
                'Invalid amount or exchange rate',
            );
        }

        return Number((amountInUsd * exchangeRate).toFixed(2));
    }

    private generateOrderNumber(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();

        return `LIT-${timestamp}-${random}`;
    }

    private async getCheckoutData(
        userId: string,
        addressId: string,
        tx: Prisma.TransactionClient = this.prisma,
    ) {

        // Lock the user's cart to prevent concurrent checkout modifications
        const lockedCart = await tx.$queryRaw<{ id: string }[]>`
            SELECT id
            FROM "Cart"
            WHERE "userId" = ${userId}
            FOR UPDATE
        `;

        if (lockedCart.length === 0) {
            throw new BadRequestException('Your cart is empty');
        }
        const [cart, address] = await Promise.all([
            tx.cart.findUnique({
                where: { userId },
                include: {
                    items: {
                        include: {
                            product: {
                                include: {
                                    variants: {
                                        select: { id: true },
                                        take: 1,
                                    },
                                },
                            },
                            variant: {
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
                                },
                            },
                        },
                    },
                },
            }),

            tx.address.findFirst({
                where: {
                    id: addressId,
                    userId,
                },
            }),
        ]);

        if (!cart || cart.items.length === 0) {
            throw new BadRequestException('Your cart is empty');
        }

        if (!address) {
            throw new NotFoundException(
                'Shipping address not found',
            );
        }

        return { cart, address };
    }

    private calculateOriginalSubtotal(
        cartItems: Awaited<
            ReturnType<OrdersService['getCheckoutData']>
        >['cart']['items'],
    ) {
        let subtotal = 0;

        for (const item of cartItems) {
            const { product, variant, quantity } = item;
            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new BadRequestException(
                    `Invalid quantity for ${product.name}`,
                );
            }

            if (
                !product.isActive ||
                product.isArchived
            ) {
                throw new BadRequestException(
                    `${product.name} is no longer available`,
                );
            }

            let unitPrice: number;

            if (product.variants.length > 0) {
                if (!variant || !variant.isActive) {
                    throw new BadRequestException(
                        `A valid variant must be selected for ${product.name}`,
                    );
                }

                if (variant.productId !== product.id) {
                    throw new BadRequestException(
                        'Invalid product variant',
                    );
                }

                if (variant.currency !== Currency.USD) {
                    throw new BadRequestException(
                        'Product variant prices must be stored in USD',
                    );
                }

                unitPrice = Number(variant.price);
            } else {
                if (variant) {
                    throw new BadRequestException(
                        `${product.name} does not support variants`,
                    );
                }

                if (
                    product.price === null ||
                    product.currency !== Currency.USD
                ) {
                    throw new BadRequestException(
                        `Invalid price configuration for ${product.name}`,
                    );
                }

                unitPrice = Number(product.price);
            }

            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new BadRequestException(
                    `Invalid price for ${product.name}`,
                );
            }

            subtotal += unitPrice * quantity;
        }

        return Number(subtotal.toFixed(2));
    }

    private validateCartStock(
        cartItems: Awaited<
            ReturnType<OrdersService['getCheckoutData']>
        >['cart']['items'],
    ) {
        for (const item of cartItems) {
            const { product, variant, quantity } = item;

            if (product.variants.length > 0) {
                if (!variant) {
                    throw new BadRequestException(
                        `Please select a variant for ${product.name}`,
                    );
                }

                const availableStock =
                    variant.stock - variant.reservedStock;

                if (quantity > availableStock) {
                    throw new BadRequestException(
                        `Insufficient stock for ${product.name}`,
                    );
                }
            } else {
                const availableStock =
                    (product.stock ?? 0) - product.reservedStock;

                if (quantity > availableStock) {
                    throw new BadRequestException(
                        `Insufficient stock for ${product.name}`,
                    );
                }
            }
        }
    }

    private async reserveStock(
        tx: Prisma.TransactionClient,
        cartItems: Awaited<
            ReturnType<OrdersService['getCheckoutData']>
        >['cart']['items'],
    ) {
        // Sort items to keep database updates in a consistent order.
        const sortedItems = [...cartItems].sort((a, b) => {
            const aKey = a.variantId ?? a.productId;
            const bKey = b.variantId ?? b.productId;

            return aKey.localeCompare(bKey);
        });

        for (const item of sortedItems) {
            const { product, variant, quantity } = item;

            if (product.variants.length > 0) {
                if (!variant) {
                    throw new BadRequestException(
                        `Please select a variant for ${product.name}`,
                    );
                }

                const reserved = await tx.$queryRaw<{ id: string }[]>`
                    UPDATE "ProductVariant" AS pv
                    SET "reservedStock" = pv."reservedStock" + ${quantity}
                    FROM "Product" AS p
                    WHERE pv.id = ${variant.id}
                    AND pv."productId" = p.id
                    AND p.id = ${product.id}
                    AND pv."isActive" = true
                    AND p."isActive" = true
                    AND p."isArchived" = false
                    AND pv."stock" - pv."reservedStock" >= ${quantity}
                    RETURNING pv.id
                `;

                if (reserved.length === 0) {
                    throw new BadRequestException(
                        `Insufficient stock for ${product.name}`,
                    );
                }
            } else {
                const reserved = await tx.$queryRaw<{ id: string }[]>`
                    UPDATE "Product"
                    SET "reservedStock" = "reservedStock" + ${quantity}
                    WHERE id = ${product.id}
                    AND "isActive" = true
                    AND "isArchived" = false
                    AND "stock" IS NOT NULL
                    AND "stock" - "reservedStock" >= ${quantity}
                    RETURNING id
                `;

                if (reserved.length === 0) {
                    throw new BadRequestException(
                        `Insufficient stock for ${product.name}`,
                    );
                }
            }
        }
    }

    private buildOrderItems(
        cartItems: Awaited<
            ReturnType<OrdersService['getCheckoutData']>
        >['cart']['items'],
        exchangeRate: number,
        currency: Currency,
    ) {
        return cartItems.map((item) => {
            const { product, variant, quantity } = item;

            const originalUnitPrice =
                variant
                    ? Number(variant.price)
                    : Number(product.price);

            const unitPrice = this.convertAmount(
                originalUnitPrice,
                exchangeRate,
            );

            const originalSubtotal = Number(
                (originalUnitPrice * quantity).toFixed(2),
            );

            const subtotal = Number(
                (unitPrice * quantity).toFixed(2),
            );

            const variantName = variant
                ? variant.attributes
                    .map(
                        (attribute) =>
                            `${attribute.attributeValue.attribute.name}: ${attribute.attributeValue.value}`,
                    )
                    .join(', ')
                : null;

            return {
                productId: product.id,
                variantId: variant?.id ?? null,
                productName: product.name,
                variantName,
                sku: variant?.sku ?? product.sku,
                originalUnitPrice,
                unitPrice,
                currency,
                quantity,
                subtotal,
            };
        });
    }

    private calculateOrderTotals(
        originalSubtotal: number,
        items: ReturnType<OrdersService['buildOrderItems']>,
        shippingCost: number,
        discountAmount: number,
    ) {
        const subtotal = Number(
            items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
        );

        const total = Number(
            (subtotal + shippingCost - discountAmount).toFixed(2),
        );

        if (
            !Number.isFinite(originalSubtotal) ||
            !Number.isFinite(subtotal) ||
            !Number.isFinite(shippingCost) ||
            !Number.isFinite(discountAmount) ||
            total < 0
        ) {
            throw new BadRequestException(
                'Unable to calculate valid order totals',
            );
        }

        return {
            originalSubtotal,
            subtotal,
            shippingCost,
            discountAmount,
            total,
        };
    }
    
    async createOrder(userId: string, dto: CreateOrderDto) {
        const exchangeRate = await this.getExchangeRate(dto.currency);
        const shippingCost = this.getShippingFee(dto.currency);

        return this.prisma.$transaction(
            async (tx) => {
                const { cart, address } = await this.getCheckoutData(
                    userId,
                    dto.addressId,
                    tx,
                );

                const originalSubtotal = this.calculateOriginalSubtotal(
                    cart.items,
                );

                this.validateCartStock(cart.items);

                let couponId: string | null = null;
                let discountAmount = 0;

                if (dto.couponCode) {
                    await tx.$queryRaw<{ id: string }[]>`
                        SELECT id
                        FROM "Coupon"
                        WHERE code = ${dto.couponCode.trim().toUpperCase()}
                        FOR UPDATE
                    `;
                    const { coupon, discountAmount: discountInUsd } =
                        await this.couponService.calculateCouponDiscount(
                            dto.couponCode,
                            originalSubtotal,
                            tx,
                        );

                    couponId = coupon.id;

                    discountAmount = this.convertAmount(
                        discountInUsd,
                        exchangeRate,
                    );
                    
                }

                const orderItems = this.buildOrderItems(
                    cart.items,
                    exchangeRate,
                    dto.currency,
                );

                const totals = this.calculateOrderTotals(
                    originalSubtotal,
                    orderItems,
                    shippingCost,
                    discountAmount,
                );

                const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

                const order = await tx.order.create({
                    data: {
                        userId,
                        addressId: address.id,
                        orderNumber: this.generateOrderNumber(),

                        currency: dto.currency,
                        subtotal: totals.subtotal,
                        shippingCost: totals.shippingCost,
                        discountAmount: totals.discountAmount,
                        total: totals.total,

                        originalCurrency: Currency.USD,
                        originalSubtotal: totals.originalSubtotal,
                        exchangeRate,

                        expiresAt,

                        shippingFirstName: address.firstName,
                        shippingLastName: address.lastName,
                        shippingPhone: address.phone,
                        shippingAddress1: address.addressLine1,
                        shippingAddress2: address.addressLine2,
                        shippingCity: address.city,
                        shippingState: address.state,
                        shippingCountry: address.country,
                        shippingPostalCode: address.postalCode,

                        shippingMethod: dto.shippingMethod,
                        notes: dto.notes,

                        items: {
                            create: orderItems,
                        },
                    },
                    include: {
                        items: true,
                    },
                });

                await this.reserveStock(tx, cart.items);
                await tx.cartItem.deleteMany({
                    where: {
                        cartId: cart.id,
                    },
                });

                return {
                    message: 'Order created successfully',
                    order,
                };
            },
            {
                maxWait: 10000,
                timeout: 20000,
            },
        );
    }

    // Get all orders belonging to a customer
    async findAll(userId: string) {
        return this.prisma.order.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                items: true,
                payments: {
                    select: {
                        id: true,
                        provider: true,
                        status: true,
                        amount: true,
                        currency: true,
                        paidAt: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        });
    }

    // Get a single order belonging to a customer
    async findOne(userId: string, orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                userId,
            },
            include: {
                items: true,
                payments: {
                    select: {
                        id: true,
                        provider: true,
                        status: true,
                        amount: true,
                        currency: true,
                        paidAt: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
            },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        return order;
    }

    // Release stock reserved by an order
    private async releaseStock(
        tx: Prisma.TransactionClient,
        orderItems: {
            productId: string;
            variantId: string | null;
            quantity: number;
        }[],
    ) {
        // Sort items to keep database updates in a consistent order.
        const sortedItems = [...orderItems].sort((a, b) => {
            const aKey = a.variantId ?? a.productId;
            const bKey = b.variantId ?? b.productId;

            return aKey.localeCompare(bKey);
        });

        for (const item of sortedItems) {
            const { productId, variantId, quantity } = item;

            if (variantId) {
                const released = await tx.$queryRaw<{ id: string }[]>`
                    UPDATE "ProductVariant"
                    SET "reservedStock" = "reservedStock" - ${quantity}
                    WHERE id = ${variantId}
                    AND "productId" = ${productId}
                    AND "reservedStock" >= ${quantity}
                    RETURNING id
                `;

                if (released.length === 0) {
                    throw new Error(
                        `Unable to release reserved stock for variant ${variantId}`,
                    );
                }
            } else {
                const released = await tx.$queryRaw<{ id: string }[]>`
                    UPDATE "Product"
                    SET "reservedStock" = "reservedStock" - ${quantity}
                    WHERE id = ${productId}
                    AND "reservedStock" >= ${quantity}
                    RETURNING id
                `;

                if (released.length === 0) {
                    throw new Error(
                        `Unable to release reserved stock for product ${productId}`,
                    );
                }
            }
        }
    }

    // Cancel a pending order and release its reserved stock
    async cancelOrder(userId: string, orderId: string) {
        return this.prisma.$transaction(
            async (tx) => {
                // Lock the order row to prevent concurrent cancellation/payment.
                const lockedOrder = await tx.$queryRaw<{ id: string }[]>`
                    SELECT id
                    FROM "Order"
                    WHERE id = ${orderId}
                    AND "userId" = ${userId}
                    FOR UPDATE
                `;

                if (lockedOrder.length === 0) {
                    throw new NotFoundException('Order not found');
                }

                const order = await tx.order.findUnique({
                    where: { id: orderId },
                    include: {
                        items: {
                            select: {
                                productId: true,
                                variantId: true,
                                quantity: true,
                            },
                        },
                    },
                });

                if (!order) {
                    throw new NotFoundException('Order not found');
                }

                if (order.status !== 'PENDING') {
                    throw new BadRequestException(
                        'Only pending orders can be cancelled',
                    );
                }

                if (order.reservationReleasedAt) {
                    throw new BadRequestException(
                        'The stock reservation for this order has already been released',
                    );
                }

                await this.releaseStock(tx, order.items);

                const cancelledOrder = await tx.order.update({
                    where: { id: orderId },
                    data: {
                        status: 'CANCELLED',
                        reservationReleasedAt: new Date(),
                    },
                });

                return {
                    message: 'Order cancelled successfully',
                    order: cancelledOrder,
                };
            },
            {
                maxWait: 10000,
                timeout: 20000,
            },
        );
    }

    // Automatically expire pending orders every minute
    @Cron(CronExpression.EVERY_MINUTE)
    async expirePendingOrders() {
        console.log('[Order Expiry] Cron job triggered:', new Date().toISOString());
        await this.prisma.$transaction(
            async (tx) => {
                const expiredOrders = await tx.$queryRaw<{ id: string }[]>`
                    SELECT id
                    FROM "Order"
                    WHERE status = 'PENDING'
                    AND "expiresAt" IS NOT NULL
                    AND "expiresAt" <= NOW()
                    AND "reservationReleasedAt" IS NULL
                    ORDER BY "expiresAt" ASC
                    FOR UPDATE SKIP LOCKED
                `;
                console.log(
                    `[Order Expiry] Found ${expiredOrders.length} expired order(s).`,
                );

                for (const expiredOrder of expiredOrders) {
                    const order = await tx.order.findUnique({
                        where: { id: expiredOrder.id },
                        include: {
                            items: {
                                select: {
                                    productId: true,
                                    variantId: true,
                                    quantity: true,
                                },
                            },
                        },
                    });

                    if (!order) continue;

                    await this.releaseStock(tx, order.items);

                    await tx.order.update({
                        where: { id: order.id },
                        data: {
                            status: 'CANCELLED',
                            reservationReleasedAt: new Date(),
                        },
                    });
                    console.log(`[Order Expiry] Order ${order.orderNumber} expired successfully.`);
                }
            },
            {
                maxWait: 10000,
                timeout: 20000,
            },
        );
    }
    
}
