// src/products/products.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { CreateProductDto } from './dto/createProduct.dto.js';
import { CreateProductAttributeDto } from './dto/createProductAttribute.dto.js';
import { UpdateProductDto } from './dto/updateProduct.dto.js';
import { CreateProductVariantDto } from './dto/createProductVariant.dto.js';
import { FindProductsDto } from './dto/findProducts.dto.js';
import { UpdateProductStatusDto } from './dto/updateProductStatus.dto.js';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UpdateProductImageDto } from './dto/updateProductImage.dto.js';
import { ReorderProductImagesDto } from './dto/reorderProductImages.dto.js';
import { ReorderVariantImagesDto } from './dto/reorderVariantImages.dto.js';
import { UpdateProductVariantDto } from './dto/updateProductVariant.dto.js';
import { UpdateVariantStatusDto } from './dto/updateVariantStatus.dto.js';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) {}

    @Post()
    @UseGuards(AccessGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Create a new product' })
    @ApiResponse({ status: 201, description: 'Product created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid product data or category' })
    @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
    create(@Body() dto: CreateProductDto) {
        return this.productsService.create(dto);
    }
    
    @Post(':productId/attributes')
    @ApiOperation({ summary: 'Create product attributes and their possible values' })
    @ApiParam({ name: 'productId', description: 'Product UUID' })
    @ApiResponse({ status: 201, description: 'Product attribute created successfully' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    @ApiResponse({ status: 409, description: 'Attribute already exists for this product' })
    createAttribute(
        @Param('productId') productId: string,
        @Body() dto: CreateProductAttributeDto,
    ) {
        return this.productsService.createAttribute(productId, dto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update product details' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product updated successfully' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    @ApiResponse({ status: 409, description: 'Product slug or SKU already exists' })
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductDto,
    ) {
        return this.productsService.update(id, dto);
    }

    @Post(':productId/variants')
    @ApiOperation({ summary: 'Create a product variant' })
    @ApiParam({ name: 'productId', description: 'Product UUID' })
    @ApiResponse({ status: 201, description: 'Product variant created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid variant data or attributes' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    @ApiResponse({ status: 409, description: 'Variant SKU or attribute combination already exists' })
    createVariant(
        @Param('productId') productId: string,
        @Body() dto: CreateProductVariantDto,
    ) {
        return this.productsService.createVariant(productId, dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a product by its ID' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    findOne(@Param('id') id: string) {
        return this.productsService.findOne(id);
    }

    @ApiQuery({ type: FindProductsDto })
    @Get()
    @ApiOperation({
        summary: 'Get products with pagination, search, filtering and sorting',
    })
    @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
    @ApiResponse({ status: 400, description: 'Invalid query parameters' })
    findAll(@Query() dto: FindProductsDto) {
        return this.productsService.findAll(dto);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Activate or deactivate a product' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product status updated successfully' })
    @ApiResponse({ status: 400, description: 'Product is archived or already has the requested status' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    updateStatus( @Param('id') id: string, @Body() dto: UpdateProductStatusDto, ) {
        return this.productsService.updateStatus(id, dto);
    }

    @Patch(':id/archive')
    @ApiOperation({ summary: 'Archive a product' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product archived successfully' })
    @ApiResponse({ status: 400, description: 'Product is already archived' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    archive(@Param('id') id: string) {
        return this.productsService.archive(id);
    }

    @Patch(':id/unarchive')
    @ApiOperation({ summary: 'Restore an archived product' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product unarchived successfully' })
    @ApiResponse({ status: 400, description: 'Product is not archived' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    unarchive(@Param('id') id: string) {
        return this.productsService.unarchive(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Permanently delete a product and its associated images' })
    @ApiParam({ name: 'id', description: 'Product UUID' })
    @ApiResponse({ status: 200, description: 'Product deleted successfully' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    @ApiResponse({ status: 409, description: 'Cannot delete a product with order history' })
    remove(@Param('id') id: string) {
        return this.productsService.remove(id);
    }

    @Post(':productId/images')
    @UseInterceptors(
        FilesInterceptor('images', 10, {
            limits: {
                fileSize: 5 * 1024 * 1024,
            },
        }),
    )
    @ApiOperation({ summary: 'Upload images for a product' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['images'],
            properties: {
                images: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                    description: 'Product images (maximum 10 files, 5MB each)',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Product images uploaded successfully' })
    @ApiResponse({ status: 400, description: 'Invalid image files or upload limit exceeded' })
    @ApiResponse({ status: 404, description: 'Product not found' })
    uploadProductImages( @Param('productId') productId: string, @UploadedFiles() files: Express.Multer.File[], ) {
        return this.productsService.uploadProductImages(productId, files);
    }

    @Delete(':productId/images/:imageId')
    @ApiOperation({ summary: 'Delete an image from a product' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'imageId',
        type: String,
        description: 'The ID of the product image to delete',
    })
    @ApiResponse({ status: 200, description: 'Product image deleted successfully' })
    @ApiResponse({ status: 404, description: 'Product or image not found' })
    deleteProductImage( @Param('productId') productId: string, @Param('imageId') imageId: string, ) {
        return this.productsService.deleteProductImage(productId, imageId);
    }

    @Post(':productId/variants/:variantId/images')
    @UseInterceptors(
        FilesInterceptor('images', 10, {
            limits: { fileSize: 5 * 1024 * 1024 },
        }),
    )
    @ApiOperation({ summary: 'Upload images for a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['images'],
            properties: {
                images: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                    description: 'Variant images (maximum 10 files, 5MB each)',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Variant images uploaded successfully' })
    @ApiResponse({ status: 400, description: 'Invalid image files or upload limit exceeded' })
    @ApiResponse({ status: 404, description: 'Product or variant not found' })
    uploadVariantImages(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        return this.productsService.uploadVariantImages(
            productId,
            variantId,
            files,
        );
    }

    @Delete(':productId/variants/:variantId/images/:imageId')
    @ApiOperation({ summary: 'Delete an image from a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant',
    })
    @ApiParam({
        name: 'imageId',
        type: String,
        description: 'The ID of the variant image to delete',
    })
    @ApiResponse({ status: 200, description: 'Variant image deleted successfully' })
    @ApiResponse({ status: 404, description: 'Product, variant, or image not found' })
    deleteVariantImage(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
        @Param('imageId') imageId: string,
    ) {
        return this.productsService.deleteVariantImage(
            productId,
            variantId,
            imageId,
        );
    }

    @Patch(':productId/images/:imageId')
    @ApiOperation({ summary: 'Update product image metadata' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'imageId',
        type: String,
        description: 'The ID of the product image',
    })
    @ApiResponse({ status: 200, description: 'Product image updated successfully' })
    @ApiResponse({ status: 404, description: 'Product or image not found' })
    @ApiResponse({ status: 400, description: 'Invalid image metadata' })
    updateProductImage(
        @Param('productId') productId: string,
        @Param('imageId') imageId: string,
        @Body() dto: UpdateProductImageDto,
    ) {
        return this.productsService.updateProductImage(
            productId,
            imageId,
            dto,
        );
    }

    @Patch(':productId/reorder-images')
    @ApiOperation({ summary: 'Reorder images for a product' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiBody({ type: ReorderProductImagesDto })
    @ApiResponse({ status: 200, description: 'Product images reordered successfully' })
    @ApiResponse({ status: 400, description: 'Invalid image order or image IDs' })
    @ApiResponse({ status: 404, description: 'Product or image not found' })
    reorderProductImages(
        @Param('productId') productId: string,
        @Body() dto: ReorderProductImagesDto,
    ) {
        return this.productsService.reorderProductImages(
            productId,
            dto,
        );
    }

    @Patch(':productId/variants/:variantId/reorder-images')
    @ApiOperation({ summary: 'Reorder images for a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant',
    })
    @ApiBody({ type: ReorderVariantImagesDto })
    @ApiResponse({ status: 200, description: 'Variant images reordered successfully' })
    @ApiResponse({ status: 400, description: 'Invalid image order or image IDs' })
    @ApiResponse({ status: 404, description: 'Product or variant not found' })
    reorderVariantImages(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
        @Body() dto: ReorderVariantImagesDto,
    ) {
        return this.productsService.reorderVariantImages(
            productId,
            variantId,
            dto,
        );
    }

    @Patch(':productId/variants/:variantId')
    @ApiOperation({ summary: 'Update a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant',
    })
    @ApiBody({ type: UpdateProductVariantDto })
    @ApiResponse({ status: 200, description: 'Product variant updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid variant data or attribute combination' })
    @ApiResponse({ status: 404, description: 'Product or variant not found' })
    @ApiResponse({ status: 409, description: 'Variant SKU or attribute combination already exists' })
    updateVariant(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
        @Body() dto: UpdateProductVariantDto,
    ) {
        return this.productsService.updateVariant(
            productId,
            variantId,
            dto,
        );
    }

    @Delete(':productId/variants/:variantId')
    @ApiOperation({ summary: 'Delete a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant to delete',
    })
    @ApiResponse({ status: 200, description: 'Product variant deleted successfully' })
    @ApiResponse({ status: 404, description: 'Product or variant not found' })
    @ApiResponse({
        status: 409,
        description: 'Cannot delete a variant associated with existing orders or cart items',
    })
    removeVariant(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
    ) {
        return this.productsService.removeVariant(productId, variantId);
    }

    @Patch(':productId/variants/:variantId/status')
    @ApiOperation({ summary: 'Activate or deactivate a product variant' })
    @ApiParam({
        name: 'productId',
        type: String,
        description: 'The ID of the product',
    })
    @ApiParam({
        name: 'variantId',
        type: String,
        description: 'The ID of the product variant',
    })
    @ApiBody({ type: UpdateVariantStatusDto })
    @ApiResponse({ status: 200, description: 'Product variant status updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid status value' })
    @ApiResponse({ status: 404, description: 'Product or variant not found' })
    updateVariantStatus(
        @Param('productId') productId: string,
        @Param('variantId') variantId: string,
        @Body() dto: UpdateVariantStatusDto,
    ) {
        return this.productsService.updateVariantStatus(
            productId,
            variantId,
            dto,
        );
    }
}
