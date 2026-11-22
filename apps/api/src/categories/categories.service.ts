// src/categories/categories.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/createCategory.dto.js';
import { UpdateCategoryDto } from './dto/updateCategory.dto.js';
import { UpdateCategoryStatusDto } from './dto/updateCategoryStatus.dto.js';

@Injectable()
export class CategoriesService {
    constructor(private readonly prisma: PrismaService) {}
    async create(dto: CreateCategoryDto) {
        const slug = dto.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

        if (!slug) {
            throw new BadRequestException(
                'Category name must contain at least one letter or number.',
            );
        }

        const existingCategory = await this.prisma.category.findFirst({
            where: {
                OR: [
                    { name: { equals: dto.name.trim(), mode: 'insensitive' } },
                    { slug },
                ],
            },
        });
        if (existingCategory) {
            throw new ConflictException(
                'A category with this name already exists.',
            );
        }

        if (dto.parentId) {
            const parentCategory = await this.prisma.category.findUnique({
                where: { id: dto.parentId },
            });

            if (!parentCategory) {
                throw new NotFoundException('Parent category not found.');
            }

            if (!parentCategory.isActive) {
                throw new ConflictException(
                    'Cannot create a subcategory under an inactive category.',
                );
            }
        }
        return this.prisma.category.create({
            data: {
                name: dto.name.trim(),
                slug,
                description: dto.description,
                imageUrl: dto.imageUrl,
                parentId: dto.parentId,
            },
        });
    }

    async findAll() {
        const categories = await this.prisma.category.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                name: 'asc',
            },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                imageUrl: true,
                parentId: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        type CategoryNode = (typeof categories)[number] & {
            children: CategoryNode[];
        };

        const categoryMap = new Map<string, CategoryNode>();

        // Create a node for every category.
        for (const category of categories) {
            categoryMap.set(category.id, {
                ...category,
                children: [],
            });
        }

        const roots: CategoryNode[] = [];

        // Connect each category to its parent.
        for (const category of categoryMap.values()) {
            if (category.parentId) {
                const parent = categoryMap.get(category.parentId);

                if (parent) {
                    parent.children.push(category);
                }
            } else {
                roots.push(category);
            }
        }

        return roots;
    }

    async findOne(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
            include: {
            parent: {
                select: {
                id: true,
                name: true,
                slug: true,
                },
            },
            children: {
                where: {
                isActive: true,
                },
                orderBy: {
                name: 'asc',
                },
            },
            },
        });

        if (!category) {
            throw new NotFoundException('Category not found.');
        }

        return category;
    }

    async update(id: string, dto: UpdateCategoryDto) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Category not found.');
        }

        const name = dto.name?.trim();

        if (name !== undefined && !name) {
            throw new BadRequestException('Category name cannot be empty.');
        }

        const slug = name
            ? name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
            : undefined;

        if (name && !slug) {
            throw new BadRequestException(
                'Category name must contain at least one letter or number.',
            );
        }

        if (name) {
            const existingCategory = await this.prisma.category.findFirst({
            where: {
                id: { not: id },
                OR: [
                    { name: { equals: name, mode: 'insensitive' } },
                    { slug },
                ],
            },
            });

            if (existingCategory) {
                throw new ConflictException(
                    'A category with this name already exists.',
                );
            }
        }

        if (dto.parentId !== undefined && dto.parentId !== category.parentId) {
            if (dto.parentId === id) {
                throw new BadRequestException(
                    'A category cannot be its own parent.',
                );
            }

            if (dto.parentId !== null) {
                const parentCategory = await this.prisma.category.findUnique({
                    where: { id: dto.parentId },
                });

                if (!parentCategory) {
                    throw new NotFoundException('Parent category not found.');
                }

                if (!parentCategory.isActive) {
                    throw new ConflictException(
                    'Cannot assign an inactive category as parent.',
                    );
                }

                // Find every descendant to prevent circular hierarchies.
                const descendants = await this.prisma.$queryRaw<{ id: string }[]>`
                    WITH RECURSIVE category_tree AS (
                    SELECT id
                    FROM "Category"
                    WHERE "parentId" = ${id}

                    UNION ALL

                    SELECT c.id
                    FROM "Category" c
                    INNER JOIN category_tree ct
                        ON c."parentId" = ct.id
                    )
                    SELECT id FROM category_tree
                `;

                if (descendants.some((descendant) => descendant.id === dto.parentId)) {
                    throw new BadRequestException(
                    'Cannot assign a descendant category as parent.',
                    );
                }
            }
        }

        return this.prisma.category.update({
            where: { id },
            data: {
                ...(name !== undefined && { name, slug }),
                ...(dto.description !== undefined && {
                    description: dto.description,
                }),
                ...(dto.imageUrl !== undefined && {
                    imageUrl: dto.imageUrl,
                }),
                ...(dto.parentId !== undefined && {
                    parentId: dto.parentId,
                }),
            },
        });
    }

    async updateStatus(id: string, dto: UpdateCategoryStatusDto) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Category not found.');
        }

        if (category.isActive === dto.isActive) {
            return category;
        }

        if (!dto.isActive) {
            const activeChildren = await this.prisma.category.count({
            where: {
                parentId: id,
                isActive: true,
            },
            });

            if (activeChildren > 0) {
            throw new ConflictException(
                'Deactivate this category’s active subcategories first.',
            );
            }
        }

        return this.prisma.category.update({
            where: { id },
            data: {
            isActive: dto.isActive,
            },
        });
    }

    async remove(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Category not found.');
        }

        const [productCount, childrenCount] = await Promise.all([
            this.prisma.product.count({
            where: { categoryId: id },
            }),
            this.prisma.category.count({
            where: { parentId: id },
            }),
        ]);

        if (productCount > 0) {
            throw new ConflictException(
            'Cannot delete a category that contains products.',
            );
        }

        if (childrenCount > 0) {
            throw new ConflictException(
            'Cannot delete a category that has subcategories.',
            );
        }

        return this.prisma.category.delete({
            where: { id },
        });
    }

}
