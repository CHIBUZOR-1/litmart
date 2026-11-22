// src/products/products.service.ts
import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/createProduct.dto.js';
import { CreateProductAttributeDto } from './dto/createProductAttribute.dto.js';
import { CreateProductVariantDto } from './dto/createProductVariant.dto.js';
import { UpdateProductDto } from './dto/updateProduct.dto.js';
import { FindProductsDto } from './dto/findProducts.dto.js';
import { UpdateProductStatusDto } from './dto/updateProductStatus.dto.js';
import { CloudinaryService } from '../cloudinary/cloudinary.service.js';
import { UpdateProductImageDto } from './dto/updateProductImage.dto.js';
import { ReorderProductImagesDto } from './dto/reorderProductImages.dto.js';
import { ReorderVariantImagesDto } from './dto/reorderVariantImages.dto.js';
import { UpdateProductVariantDto } from './dto/updateProductVariant.dto.js';
import { UpdateVariantStatusDto } from './dto/updateVariantStatus.dto.js';

@Injectable()
export class ProductsService {
    constructor( private readonly prisma: PrismaService, private readonly cloudinaryService: CloudinaryService, ) {}
    
    async create(dto: CreateProductDto) {
        const name = dto.name.trim();

        if (!name) {
            throw new BadRequestException('Product name cannot be empty.');
        }
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        
        // Check for duplicate slug
        const existingSlug = await this.prisma.product.findUnique({
            where: { slug },
            select: { id: true },
        })
        if (existingSlug) {
            throw new ConflictException(
                'A product with this name already exists.',
            );
        }

        const sku = dto.sku?.trim() || undefined;
        // Check for duplicate SKU
        if (sku) {
            const existingSku = await this.prisma.product.findUnique({
                where: { sku },
                select: { id: true },
            });

            if (existingSku) {
                throw new ConflictException(
                    'A product with this SKU already exists.',
                );
            }
        }
        // Verify category
        const category = await this.prisma.category.findUnique({
            where: { id: dto.categoryId },
            select: {
                id: true,
                isActive: true,
            },
        });

        if (!category) {
            throw new NotFoundException('Category not found.');
        }

        if (!category.isActive) {
            throw new BadRequestException(
                'Cannot create a product under an inactive category.',
            );
        }
        // Create product
        const product = await this.prisma.product.create({
            data: {
                name,
                slug,
                categoryId: dto.categoryId,
                brand: dto.brand?.trim() || undefined,
                description: dto.description?.trim() || undefined,
                price: dto.price,
                currency: dto.currency,
                stock: dto.stock,
                sku,
                isNewArrival: dto.isNewArrival ?? false,
            },
            include: {
                category: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                },
                },
            },
        });
        return {
            message: 'Product created successfully.',
            product,
        };
    }


    // Upload images for a product
    async uploadProductImages( productId: string, files: Express.Multer.File[], ) {
        if (!files || files.length === 0) {
            throw new BadRequestException('At least one image is required.');
        }

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product.isArchived) {
            throw new BadRequestException(
                'Cannot upload images to an archived product.',
            );
        }

        const existingImages = await this.prisma.productImage.aggregate({
            where: { productId },
            _max: {
                sortOrder: true,
            },
        });

        const nextSortOrder = (existingImages._max.sortOrder ?? -1) + 1;

        const uploadedImages = await this.cloudinaryService.uploadImages(
            files,
            `litmart/products/${productId}`,
        );

        try {
            const images = await this.prisma.$transaction(async (tx) => {
                await tx.productImage.createMany({
                    data: uploadedImages.map((image, index) => ({
                    productId,
                    url: image.secure_url,
                    publicId: image.public_id,
                    sortOrder: nextSortOrder + index,
                    })),
                });

                return tx.productImage.findMany({
                    where: {
                        productId,
                        publicId: {
                            in: uploadedImages.map((image) => image.public_id),
                        },
                    },
                        orderBy: {
                        sortOrder: 'asc',
                    },
                });
            });

            return {
                message: 'Product images uploaded successfully.',
                images,
            };
        } catch (error) {
            // Remove Cloudinary uploads if saving to PostgreSQL fails.
            await Promise.allSettled(
                uploadedImages.map((image) =>
                    this.cloudinaryService.deleteImage(image.public_id),
                ),
            );

            throw error;
        }
    }


    async createAttribute( productId: string, dto: CreateProductAttributeDto, ) {
        const name = dto.name.trim();

        if (!name) {
            throw new BadRequestException('Attribute name cannot be empty.');
        }

        const values = dto.values.map((value) => value.trim());

        if (values.some((value) => !value)) {
            throw new BadRequestException('Attribute values cannot be empty.');
        }

        if (new Set(values).size !== values.length) {
            throw new BadRequestException(
                'Attribute values must not contain duplicates.',
            );
        }

        // Verify product exists
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: { id: true },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        // Check whether this attribute already exists for the product
        const existingAttribute = await this.prisma.productAttribute.findUnique({
            where: {
                productId_name: {
                    productId,
                    name,
                },
            },
            select: { id: true },
        });

        if (existingAttribute) {
            throw new ConflictException(
                `The attribute "${name}" already exists for this product.`,
            );
        }

        const attribute = await this.prisma.$transaction(async (tx) => {
            return tx.productAttribute.create({
                data: {
                    name,
                    productId,
                    values: {
                        create: values.map((value) => ({
                            value,
                        })),
                    },
                },
                include: {
                    values: true,
                },
            });
        });

        return {
            message: 'Product attribute created successfully.',
            attribute,
        };
    }

    async createVariant( productId: string, dto: CreateProductVariantDto, ) {
        const sku = dto.sku.trim();

        if (!sku) {
            throw new BadRequestException('Variant SKU cannot be empty.');
        }
        // Verify product exists
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                price: true,
                currency: true,
                stock: true,
                isArchived: true,
            },
        });
        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product.isArchived) {
            throw new BadRequestException(
                'Cannot add variants to an archived product.',
            );
        }
        const existingVariant = await this.prisma.productVariant.findUnique({
            where: { sku },
            select: { id: true },
        });

        if (existingVariant) {
            throw new ConflictException(
                'A product variant with this SKU already exists.',
            );
        }

        // Ensure this is a variant-based product, not a simple product
        if (product.price !== null || product.currency !== null || product.stock !== null) {
            throw new BadRequestException(
                'Clear the product-level price, currency, and stock before adding variants.',
            );
        }

        const attributeValueIds = dto.attributeValueIds ?? [];

        if (attributeValueIds.length > 0) {
            // Fetch the selected attribute values belonging to this product
            const attributeValues = await this.prisma.productAttributeValue.findMany({
                where: {
                    id: { in: attributeValueIds },
                    attribute: {
                        productId,
                    },
                },
                select: {
                    id: true,
                    attributeId: true,
                },
            });

            // Ensure every submitted ID belongs to this product
            if (attributeValues.length !== attributeValueIds.length) {
                throw new BadRequestException(
                'One or more attribute values are invalid or do not belong to this product.',
                );
            }

            // Ensure only one value is selected per attribute
            const attributeIds = attributeValues.map(
                (item) => item.attributeId,
            );

            if (new Set(attributeIds).size !== attributeIds.length) {
                throw new BadRequestException(
                    'A variant cannot have multiple values for the same attribute.',
                );
            }
        }

        // Fetch existing variants and their selected attribute values
        const existingVariants = await this.prisma.productVariant.findMany({
            where: { productId },
            select: {
                id: true,
                attributes: {
                    select: {
                        attributeValueId: true,
                    },
                },
            },
        });

        // Check whether this exact attribute combination already exists
        const duplicateCombination = existingVariants.some((variant) => {
            const existingValueIds = variant.attributes.map(
                (attribute) => attribute.attributeValueId,
            );

            return (
                existingValueIds.length === attributeValueIds.length &&
                existingValueIds.every((id) => attributeValueIds.includes(id))
            );
        });

        if (duplicateCombination) {
            throw new ConflictException(
                'A product variant with this attribute combination already exists.',
            );
        }

        const variant = await this.prisma.productVariant.create({
            data: {
                productId,
                sku,
                price: dto.price,
                currency: dto.currency,
                stock: dto.stock,
                attributes: {
                create: attributeValueIds.map((attributeValueId) => ({
                    attributeValue: {
                    connect: { id: attributeValueId },
                    },
                })),
                },
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
            },
        });

        return {
            message: 'Product variant created successfully.',
            variant,
        };

    }
    // Product update service
    async update(productId: string, dto: UpdateProductDto) {
        // Verify product exists
        const existingProduct = await this.prisma.product.findUnique({
            where: { id: productId },
            include: {
                variants: {
                    select: { id: true },
                },
                cartItems: {
                    where: { variantId: null },
                    select: { id: true },
                },
            },
        });

        if (!existingProduct) {
            throw new NotFoundException('Product not found.');
        }

        if (existingProduct.isArchived) {
            throw new BadRequestException('Cannot update an archived product.');
        }
        // Determine the resulting product pricing fields
        const price = dto.price !== undefined? dto.price : existingProduct.price;

        const currency = dto.currency !== undefined? dto.currency : existingProduct.currency;

        const stock = dto.stock !== undefined ? dto.stock : existingProduct.stock;

        // Ensure pricing fields are either all populated or all null
        const allNull = price === null && currency === null && stock === null;

        const allPopulated = price !== null && currency !== null && stock !== null;

        if (!allNull && !allPopulated) {
            throw new BadRequestException(
                'Price, currency, and stock must either all have values or all be null.',
            );
        }

        // Products with variants must not have product-level pricing
        if (existingProduct.variants.length > 0 && !allNull) {
            throw new BadRequestException(
                'Products with variants must have null product-level price, currency, and stock.',
            );
        }

        // Prevent conversion when simple-product cart items exist
        const isConvertingToVariantProduct = existingProduct.variants.length === 0 && existingProduct.price !== null && allNull;

        if ( isConvertingToVariantProduct && existingProduct.cartItems.length > 0 ) {
            throw new BadRequestException(
                'Remove this product from existing carts before converting it to a variant-based product.',
            );
        }
        const name = dto.name?.trim() ?? existingProduct.name;

        if (!name) {
            throw new BadRequestException('Product name cannot be empty.');
        }

        const slug = dto.name
            ? name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
            : existingProduct.slug;

        if (!slug) {
            throw new BadRequestException('Invalid product name for generating a slug.');
        }

        if (slug !== existingProduct.slug) {
            const existingSlug = await this.prisma.product.findUnique({
                where: { slug },
                select: { id: true },
            });

            if (existingSlug) {
                throw new ConflictException(
                    'A product with this name already exists.',
                );
            }
        }
        if (dto.categoryId !== undefined) {
            const category = await this.prisma.category.findUnique({
                where: { id: dto.categoryId },
                select: {
                    id: true,
                    isActive: true,
                },
            });

            if (!category) {
                throw new NotFoundException('Category not found.');
            }

            if (!category.isActive) {
                throw new BadRequestException(
                    'Cannot assign a product to an inactive category.',
                );
            }
        }
        const sku = dto.sku !== undefined
            ? dto.sku.trim()
            : existingProduct.sku;

        if (dto.sku !== undefined && !sku) {
            throw new BadRequestException('Product SKU cannot be empty.');
        }

        if (sku && sku !== existingProduct.sku) {
            const existingSku = await this.prisma.product.findUnique({
                where: { sku },
                select: { id: true },
            });

            if (existingSku) {
                throw new ConflictException(
                    'A product with this SKU already exists.',
                );
            }
        }

        const brand = dto.brand !== undefined
            ? dto.brand?.trim() || null
            : existingProduct.brand;

        const description = dto.description !== undefined
            ? dto.description?.trim() || null
            : existingProduct.description;
        const updatedProduct = await this.prisma.product.update({
            where: { id: productId },
            data: {
                name,
                slug,
                categoryId: dto.categoryId,
                brand,
                description,
                price,
                currency,
                stock,
                sku,
                isNewArrival: dto.isNewArrival,
            },
            include: {
                category: true,
            },
        });
        return {
            message: 'Product updated successfully.',
            product: updatedProduct,
        };
    }

    // Getting a Product by Id
    async findOne(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: {
                id: productId,
            },
            include: {
                category: true,
                images: {
                    orderBy: {
                        sortOrder: 'asc',
                    },
                },
                attributes: {
                    include: {
                        values: true,
                    },
                },
                variants: {
                    where: {
                        isActive: true,
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
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        return {
            message: 'Product retrieved successfully.',
            product,
        };
    }

    //Get all products with filtering
    async findAll(dto: FindProductsDto) {
        const { page = 1, limit = 12, search, categoryId, minPrice, maxPrice, currency, sortBy = 'newest', } = dto;

        const orderBy =
            sortBy === 'oldest'
                ? { createdAt: 'asc' as const }
                : sortBy === 'name_asc'
                ? { name: 'asc' as const }
                : sortBy === 'name_desc'
                    ? { name: 'desc' as const }
                    : { createdAt: 'desc' as const };

        const skip = (page - 1) * limit;
        const normalizedSearch = search?.trim();
        let categoryIds: string[] | undefined;
        if (categoryId) {
            const categories = await this.prisma.category.findMany({
                where: {
                    isActive: true,
                },
                select: {
                    id: true,
                    parentId: true,
                },
            });

            // Ensure the requested category exists and is active
            if (!categories.some((category) => category.id === categoryId)) {
                return {
                    message: 'Products retrieved successfully.',
                    products: [],
                    pagination: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        hasNextPage: false,
                        hasPreviousPage: page > 1,
                    },
                };
            }

            // Build a parent-to-children lookup
            const childrenByParent = new Map<string, string[]>();

            for (const category of categories) {
                if (!category.parentId) continue;

                const children = childrenByParent.get(category.parentId) ?? [];
                children.push(category.id);

                childrenByParent.set(category.parentId, children);
            }

            // Traverse the category tree using BFS
            const descendantIds = new Set<string>([categoryId]);

            const queue: string[] = [categoryId];

            let queueIndex = 0;

            while (queueIndex < queue.length) {
                const currentId = queue[queueIndex++];

                for (const childId of childrenByParent.get(currentId) ?? []) {
                    if (!descendantIds.has(childId)) {
                        descendantIds.add(childId);
                        queue.push(childId);
                    }
                }
            }

            categoryIds = [...descendantIds];
        }

        if (
            minPrice !== undefined &&
            maxPrice !== undefined &&
            minPrice > maxPrice
        ) {
            throw new BadRequestException(
                'Minimum price cannot be greater than maximum price.',
            );
        }
        const hasPriceFilter =
            minPrice !== undefined ||
            maxPrice !== undefined ||
            currency !== undefined;

        const priceFilter = {
            ...(minPrice !== undefined && { gte: minPrice }),
            ...(maxPrice !== undefined && { lte: maxPrice }),
        };
        const conditions = [
            ...(normalizedSearch
                ? [{
                    OR: [
                        {
                            name: {
                                contains: normalizedSearch,
                                mode: 'insensitive' as const,
                            },
                        },
                        {
                            brand: {
                                contains: normalizedSearch,
                                mode: 'insensitive' as const,
                            },
                        },
                    ],
                }]
                : []),

            ...(hasPriceFilter
                ? [{
                    OR: [
                        {
                            price: priceFilter,
                            ...(currency && { currency }),
                        },
                        {
                            variants: {
                                some: {
                                    isActive: true,
                                    price: priceFilter,
                                    ...(currency && { currency }),
                                },
                            },
                        },
                    ],
                }]
                : []),
        ];
        const where = {
            isActive: true,
            isArchived: false,

            ...(categoryIds && {
                    categoryId: {
                        in: categoryIds,
                    },
                }),
            ...(conditions.length > 0 && { AND: conditions }),
        };

        const [products, total] = await this.prisma.$transaction([
            this.prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                include: {
                    category: true,
                    images: {
                        orderBy: {
                            sortOrder: 'asc',
                        },
                    },
                    variants: {
                        where: {
                            isActive: true,
                            ...(hasPriceFilter && {
                                price: priceFilter,
                                ...(currency && { currency }),
                            }),
                        },
                        select: {
                            id: true,
                            price: true,
                            currency: true,
                            stock: true,
                        },
                    },
                },
            }),

            this.prisma.product.count({ where }),
        ]);

        return {
                message: 'Products retrieved successfully.',
                products,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    hasNextPage: page * limit < total,
                    hasPreviousPage: page > 1,
                },
        };
    }


    async updateStatus(productId: string, dto: UpdateProductStatusDto) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                isActive: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product.isArchived) {
            throw new BadRequestException(
                'Cannot change the status of an archived product.',
            );
        }

        if (product.isActive === dto.isActive) {
            throw new BadRequestException(
                `Product is already ${dto.isActive ? 'active' : 'inactive'}.`,
            );
        }

        const updatedProduct = await this.prisma.product.update({
            where: { id: productId },
            data: {
                isActive: dto.isActive,
            },
        });

        return {
            message: `Product ${dto.isActive ? 'activated' : 'deactivated'} successfully.`,
            product: updatedProduct,
        };
    }


    async archive(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product.isArchived) {
            throw new BadRequestException('Product is already archived.');
        }

        const archivedProduct = await this.prisma.product.update({
            where: { id: productId },
            data: {
                isActive: false,
                isArchived: true,
                archivedAt: new Date(),
            },
        });

        return {
            message: 'Product archived successfully.',
            product: archivedProduct,
        };
    }


    async unarchive(productId: string) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (!product.isArchived) {
            throw new BadRequestException('Product is not archived.');
        }

        const unarchivedProduct = await this.prisma.product.update({
            where: { id: productId },
            data: {
                isArchived: false,
                archivedAt: null,
            },
        });

        return {
            message: 'Product unarchived successfully.',
            product: unarchivedProduct,
        };
    }

    // Product delete function 
    // Permanently delete a product
    async remove(productId: string) {
        // Fetch product, order count, and all associated image public IDs
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        orderItems: true,
                    },
                },
                images: {
                    select: {
                        publicId: true,
                    },
                },
                variants: {
                    select: {
                        images: {
                            select: {
                                publicId: true,
                            },
                        },
                    },
                },
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product._count.orderItems > 0) {
            throw new ConflictException(
                'Cannot permanently delete a product with order history. Archive it instead.',
            );
        }

        // Collect product and variant image public IDs
        const publicIds = [
            ...product.images.map((image) => image.publicId),
            ...product.variants.flatMap((variant) =>
                variant.images.map((image) => image.publicId),
            ),
        ];

        // Delete all associated images from Cloudinary
        const deletionResults = await Promise.allSettled(
            publicIds.map((publicId) =>
                this.cloudinaryService.deleteImage(publicId),
            ),
        );

        // Do not delete the database records if any Cloudinary deletion fails
        if (deletionResults.some((result) => result.status === 'rejected')) {
            throw new InternalServerErrorException(
                'Unable to delete all product images from Cloudinary. The product was not deleted. Please retry.',
            );
        }

        // Permanently delete the product and its related database records
        const deletedProduct = await this.prisma.$transaction(async (tx) => {
            const existingProduct = await tx.product.findUnique({
                where: { id: productId },
                select: {
                    id: true,
                    name: true,
                    _count: {
                        select: {
                            orderItems: true,
                        },
                    },
                },
            });

            if (!existingProduct) {
                throw new NotFoundException('Product not found.');
            }

            if (existingProduct._count.orderItems > 0) {
                throw new ConflictException(
                    'Cannot permanently delete a product with order history. Archive it instead.',
                );
            }

            return tx.product.delete({
                where: { id: productId },
                select: {
                    id: true,
                    name: true,
                },
            });
        });

        return {
            message: 'Product deleted successfully.',
            product: deletedProduct,
        };
    }

    // Delete an individual product image
    async deleteProductImage(productId: string, imageId: string) {
        const image = await this.prisma.productImage.findFirst({
            where: {
                id: imageId,
                productId,
            },
            select: {
                id: true,
                publicId: true,
            },
        });

        if (!image) {
            throw new NotFoundException('Product image not found.');
        }

        // Delete the actual image from Cloudinary first.
        await this.cloudinaryService.deleteImage(image.publicId);

        // Delete its database record.
        await this.prisma.productImage.delete({
            where: {
                id: image.id,
            },
        });

        return {
            message: 'Product image deleted successfully.',
        };
    }

    async uploadVariantImages(
        productId: string,
        variantId: string,
        files: Express.Multer.File[],
    ) {
        if (!files || files.length === 0) {
            throw new BadRequestException('At least one image is required.');
        }

        // Verify product exists and is not archived
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                isArchived: true,
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        if (product.isArchived) {
            throw new BadRequestException(
                'Cannot upload images to an archived product.',
            );
        }

        // Verify variant belongs to this product
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
            select: {
                id: true,
            },
        });

        if (!variant) {
            throw new NotFoundException(
                'Product variant not found for this product.',
            );
        }

        // Get the next sort order
        const lastImage = await this.prisma.productVariantImage.aggregate({
            where: { variantId },
            _max: { sortOrder: true },
        });

        const nextSortOrder = (lastImage._max.sortOrder ?? -1) + 1;

        // Upload images to Cloudinary
        const uploadedImages = await this.cloudinaryService.uploadImages(
            files,
            `litmart/products/${productId}/variants/${variantId}`,
        );

        try {
            // Save image metadata in the database
            await this.prisma.productVariantImage.createMany({
                data: uploadedImages.map((image, index) => ({
                    variantId,
                    url: image.secure_url,
                    publicId: image.public_id,
                    sortOrder: nextSortOrder + index,
                })),
            });

            const images = await this.prisma.productVariantImage.findMany({
                where: {
                    variantId,
                    publicId: {
                        in: uploadedImages.map((image) => image.public_id),
                    },
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            });

            return {
                message: 'Variant images uploaded successfully.',
                images,
            };
        } catch (error) {
            // Clean up Cloudinary uploads if database saving fails
            await Promise.allSettled(
                uploadedImages.map((image) =>
                    this.cloudinaryService.deleteImage(image.public_id),
                ),
            );

            throw error;
        }
    }

    async deleteVariantImage(
        productId: string,
        variantId: string,
        imageId: string,
    ) {
        const image = await this.prisma.productVariantImage.findFirst({
            where: {
                id: imageId,
                variantId,
                variant: {
                    productId,
                },
            },
            select: {
                id: true,
                publicId: true,
            },
        });

        if (!image) {
            throw new NotFoundException('Variant image not found.');
        }

        await this.cloudinaryService.deleteImage(image.publicId);

        await this.prisma.productVariantImage.delete({
            where: {
                id: image.id,
            },
        });

        return {
            message: 'Variant image deleted successfully.',
        };
    }

    // Update product image alt text
    async updateProductImage(
        productId: string,
        imageId: string,
        dto: UpdateProductImageDto,
    ) {
        const image = await this.prisma.productImage.findFirst({
            where: {
                id: imageId,
                productId,
            },
            select: {
                id: true,
            },
        });

        if (!image) {
            throw new NotFoundException('Product image not found.');
        }

        const updatedImage = await this.prisma.productImage.update({
            where: {
                id: image.id,
            },
            data: {
                ...(dto.altText !== undefined && {
                    altText: dto.altText?.trim() || null,
                }),
            },
        });

        return {
            message: 'Product image updated successfully.',
            image: updatedImage,
        };
    }

    // Reorder product images
    async reorderProductImages(
        productId: string,
        dto: ReorderProductImagesDto,
    ) {
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: {
                id: true,
                images: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (!product) {
            throw new NotFoundException('Product not found.');
        }

        const existingImageIds = product.images.map((image) => image.id);

        // Ensure every product image is included exactly once
        if (
            existingImageIds.length !== dto.imageIds.length ||
            !existingImageIds.every((id) => dto.imageIds.includes(id))
        ) {
            throw new BadRequestException(
                'Provide all image IDs belonging to this product, with no duplicates or missing images.',
            );
        }

        // Update image ordering in a single database transaction
        const updatedImages = await this.prisma.$transaction(
            dto.imageIds.map((imageId, index) =>
                this.prisma.productImage.update({
                    where: { id: imageId },
                    data: { sortOrder: index },
                }),
            ),
        );

        return {
            message: 'Product images reordered successfully.',
            images: updatedImages,
        };
    }

    async reorderVariantImages(
        productId: string,
        variantId: string,
        dto: ReorderVariantImagesDto,
    ) {
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
            select: {
                id: true,
                images: {
                    select: { id: true },
                },
            },
        });

        if (!variant) {
            throw new NotFoundException('Product variant not found.');
        }

        const existingImageIds = variant.images.map(image => image.id);

        if (
            existingImageIds.length !== dto.imageIds.length ||
            !existingImageIds.every(id => dto.imageIds.includes(id))
        ) {
            throw new BadRequestException(
                'Provide all image IDs belonging to this variant, with no duplicates or missing images.',
            );
        }

        const updatedImages = await this.prisma.$transaction(
            dto.imageIds.map((imageId, index) =>
                this.prisma.productVariantImage.update({
                    where: { id: imageId },
                    data: { sortOrder: index },
                }),
            ),
        );

        return {
            message: 'Variant images reordered successfully.',
            images: updatedImages,
        };
    }

    async updateVariant(
        productId: string,
        variantId: string,
        dto: UpdateProductVariantDto,
    ) {
        // Verify product and variant exist
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
            include: {
                attributes: {
                    select: {
                        attributeValueId: true,
                    },
                },
            },
        });

        if (!variant) {
            throw new NotFoundException('Product variant not found.');
        }

        // Verify product is not archived
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
            select: { isArchived: true },
        });

        if (product?.isArchived) {
            throw new BadRequestException(
                'Cannot update variants of an archived product.',
            );
        }

        // Validate SKU
        const sku = dto.sku !== undefined ? dto.sku.trim() : undefined;

        if (sku !== undefined && !sku) {
            throw new BadRequestException('Variant SKU cannot be empty.');
        }

        if (sku !== undefined && sku !== variant.sku) {
            const existingSku = await this.prisma.productVariant.findUnique({
                where: { sku },
                select: { id: true },
            });

            if (existingSku) {
                throw new ConflictException(
                    'A product variant with this SKU already exists.',
                );
            }
        }

        // Validate attribute values when a new combination is supplied
        const attributeValueIds = dto.attributeValueIds;

        if (attributeValueIds !== undefined) {
            const attributeValues =
                await this.prisma.productAttributeValue.findMany({
                    where: {
                        id: { in: attributeValueIds },
                        attribute: { productId },
                    },
                    select: {
                        id: true,
                        attributeId: true,
                    },
                });

            if (attributeValues.length !== attributeValueIds.length) {
                throw new BadRequestException(
                    'One or more attribute values are invalid or do not belong to this product.',
                );
            }

            const attributeIds = attributeValues.map(
                (item) => item.attributeId,
            );

            if (new Set(attributeIds).size !== attributeIds.length) {
                throw new BadRequestException(
                    'A variant cannot have multiple values for the same attribute.',
                );
            }

            // Check for duplicate attribute combinations, excluding this variant
            const existingVariants = await this.prisma.productVariant.findMany({
                where: {
                    productId,
                    id: { not: variantId },
                },
                select: {
                    attributes: {
                        select: { attributeValueId: true },
                    },
                },
            });

            const duplicateCombination = existingVariants.some(
                (existingVariant) => {
                    const existingIds = existingVariant.attributes.map(
                        (attribute) => attribute.attributeValueId,
                    );

                    return (
                        existingIds.length === attributeValueIds.length &&
                        existingIds.every((id) => attributeValueIds.includes(id))
                    );
                },
            );

            if (duplicateCombination) {
                throw new ConflictException(
                    'A product variant with this attribute combination already exists.',
                );
            }
        }

        // Update variant
        const updatedVariant = await this.prisma.$transaction(async (tx) => {
            return tx.productVariant.update({
                where: { id: variantId },
                data: {
                    ...(sku !== undefined && { sku }),
                    ...(dto.price !== undefined && { price: dto.price }),
                    ...(dto.currency !== undefined && { currency: dto.currency }),
                    ...(dto.stock !== undefined && { stock: dto.stock }),

                    ...(attributeValueIds !== undefined && {
                        attributes: {
                            deleteMany: {},
                            create: attributeValueIds.map((attributeValueId) => ({
                                attributeValue: {
                                    connect: { id: attributeValueId },
                                },
                            })),
                        },
                    }),
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
                        orderBy: { sortOrder: 'asc' },
                    },
                },
            });
        });

        return {
            message: 'Product variant updated successfully.',
            variant: updatedVariant,
        };
    }

    async removeVariant(productId: string, variantId: string) {
        // Verify variant belongs to product and retrieve its references
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
            select: {
                id: true,
                sku: true,
                _count: {
                    select: {
                        orderItems: true,
                        cartItems: true,
                    },
                },
                images: {
                    select: {
                        publicId: true,
                    },
                },
            },
        });

        if (!variant) {
            throw new NotFoundException('Product variant not found.');
        }

        // Preserve historical order records
        if (variant._count.orderItems > 0) {
            throw new ConflictException(
                'Cannot permanently delete a variant with order history. Deactivate it instead.',
            );
        }

        // Prevent cart items from losing their variant reference
        if (variant._count.cartItems > 0) {
            throw new ConflictException(
                'Cannot delete a variant currently in customer carts. Remove it from carts first.',
            );
        }

        // Delete associated Cloudinary images
        const deletionResults = await Promise.allSettled(
            variant.images.map(image =>
                this.cloudinaryService.deleteImage(image.publicId),
            ),
        );

        if (deletionResults.some(result => result.status === 'rejected')) {
            throw new InternalServerErrorException(
                'Unable to delete all variant images. The variant was not deleted.',
            );
        }

        // Recheck references and delete variant
        const deletedVariant = await this.prisma.$transaction(async tx => {
            const currentVariant = await tx.productVariant.findUnique({
                where: { id: variantId },
                select: {
                    _count: {
                        select: {
                            orderItems: true,
                            cartItems: true,
                        },
                    },
                },
            });

            if (!currentVariant) {
                throw new NotFoundException('Product variant not found.');
            }

            if (
                currentVariant._count.orderItems > 0 ||
                currentVariant._count.cartItems > 0
            ) {
                throw new ConflictException(
                    'Cannot delete a variant that has been added to an order or customer cart.',
                );
            }

            return tx.productVariant.delete({
                where: { id: variantId },
                select: {
                    id: true,
                    sku: true,
                },
            });
        });

        return {
            message: 'Product variant deleted successfully.',
            variant: deletedVariant,
        };
    }

    async updateVariantStatus(
        productId: string,
        variantId: string,
        dto: UpdateVariantStatusDto,
    ) {
        const variant = await this.prisma.productVariant.findFirst({
            where: {
                id: variantId,
                productId,
            },
            select: {
                id: true,
                isActive: true,
            },
        });

        if (!variant) {
            throw new NotFoundException('Product variant not found.');
        }

        if (variant.isActive === dto.isActive) {
            throw new BadRequestException(
                `Product variant is already ${dto.isActive ? 'active' : 'inactive'}.`,
            );
        }

        const updatedVariant = await this.prisma.productVariant.update({
            where: { id: variantId },
            data: {
                isActive: dto.isActive,
            },
            select: {
                id: true,
                sku: true,
                isActive: true,
                updatedAt: true,
            },
        });

        return {
            message: `Product variant ${dto.isActive ? 'activated' : 'deactivated'} successfully.`,
            variant: updatedVariant,
        };
    }

}
