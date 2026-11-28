import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAddressDto } from './dto/createAddress.dto.js';
import { UpdateAddressDto } from './dto/updateAddress.dto.js';

@Injectable()
export class AddressesService {
    constructor( private readonly prisma: PrismaService) {}

    // Create an address
    async create(userId: string, dto: CreateAddressDto) {
        return this.prisma.$transaction(async (tx) => {
            // Lock the user's row to serialize default-address changes
            await tx.$queryRaw`
                SELECT id
                FROM "User"
                WHERE id = ${userId}
                FOR UPDATE
            `;

            const addressCount = await tx.address.count({
                where: { userId },
            });

            // The first address becomes the default automatically
            const shouldBeDefault =
                dto.isDefault === true || addressCount === 0;

            // Ensure the user has only one default address
            if (shouldBeDefault) {
                await tx.address.updateMany({
                    where: {
                        userId,
                        isDefault: true,
                    },
                    data: {
                        isDefault: false,
                    },
                });
            }

            return tx.address.create({
                data: {
                    userId,
                    label: dto.label,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    phone: dto.phone,
                    addressLine1: dto.addressLine1,
                    addressLine2: dto.addressLine2,
                    city: dto.city,
                    state: dto.state,
                    country: dto.country ?? 'Nigeria',
                    postalCode: dto.postalCode,
                    isDefault: shouldBeDefault,
                },
            });
        });
    }

    // Get all addresses belonging to a user
    async findAll(userId: string) {
        return this.prisma.address.findMany({
            where: { userId },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'desc' },
            ],
        });
    }

    // Get a single address belonging to a user
    async findOne(userId: string, addressId: string) {
        const address = await this.prisma.address.findFirst({
            where: {
                id: addressId,
                userId,
            },
        });

        if (!address) {
            throw new NotFoundException('Address not found');
        }

        return address;
    }

    // Update an address
    async update(
        userId: string,
        addressId: string,
        dto: UpdateAddressDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            // Lock the user's row to serialize default-address changes
            await tx.$queryRaw`
                SELECT id
                FROM "User"
                WHERE id = ${userId}
                FOR UPDATE
            `;

            // Verify that the address belongs to the user
            const existingAddress = await tx.address.findFirst({
                where: {
                    id: addressId,
                    userId,
                },
            });

            if (!existingAddress) {
                throw new NotFoundException('Address not found');
            }

            // If this address is becoming the default,
            // remove the default status from other addresses
            if (dto.isDefault === true) {
                await tx.address.updateMany({
                    where: {
                        userId,
                        isDefault: true,
                        id: { not: addressId },
                    },
                    data: {
                        isDefault: false,
                    },
                });
            }

            return tx.address.update({
                where: { id: addressId },
                data: dto,
            });
        });
    }

    // Set an address as default
    async setDefault(userId: string, addressId: string) {
        return this.prisma.$transaction(async (tx) => {
            // Serialize default-address changes for this user
            await tx.$queryRaw`
                SELECT id
                FROM "User"
                WHERE id = ${userId}
                FOR UPDATE
            `;

            // Verify address ownership
            const address = await tx.address.findFirst({
                where: {
                    id: addressId,
                    userId,
                },
            });

            if (!address) {
                throw new NotFoundException('Address not found');
            }

            // Remove the default status from other addresses
            await tx.address.updateMany({
                where: {
                    userId,
                    isDefault: true,
                    id: { not: addressId },
                },
                data: {
                    isDefault: false,
                },
            });

            // Set the selected address as default
            return tx.address.update({
                where: { id: addressId },
                data: { isDefault: true },
            });
        });
    }

    // Delete an address
    async remove(userId: string, addressId: string) {
        return this.prisma.$transaction(async (tx) => {
            // Serialize address changes for this user
            await tx.$queryRaw`
                SELECT id
                FROM "User"
                WHERE id = ${userId}
                FOR UPDATE
            `;

            // Verify address ownership
            const address = await tx.address.findFirst({
                where: {
                    id: addressId,
                    userId,
                },
            });

            if (!address) {
                throw new NotFoundException('Address not found');
            }

            // Prevent deletion if the address is linked to an order
            const orderCount = await tx.order.count({
                where: { addressId },
            });

            if (orderCount > 0) {
                throw new ConflictException(
                    'This address is linked to an order and cannot be deleted',
                );
            }

            // Delete the address
            await tx.address.delete({
                where: { id: addressId },
            });

            // If the deleted address was the default,
            // promote the most recently created remaining address
            if (address.isDefault) {
                const nextAddress = await tx.address.findFirst({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                });

                if (nextAddress) {
                    await tx.address.update({
                        where: { id: nextAddress.id },
                        data: { isDefault: true },
                    });
                }
            }

            return {
                message: 'Address deleted successfully',
            };
        });
    }
}
