import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { WishlistService } from './wishlist.service.js';
import type { Request } from 'express';
import { AddWishlistItemDto } from './dto/addWishlistItem.dto.js';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

type AuthenticatedRequest = Request & {
    user: {
        sub: string;
    };
};

@Controller('wishlist')
@UseGuards(AccessGuard)
export class WishlistController {
    constructor(private readonly wishlistService: WishlistService) {}

    @Post('items')
    @ApiOperation({ summary: 'Add a product to wishlist' })
    @ApiResponse({ status: 201, description: 'Item added to wishlist' })
    addItem(
        @Req() req: AuthenticatedRequest,
        @Body() dto: AddWishlistItemDto,
    ) {
        return this.wishlistService.addItem(req.user.sub, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get items in wishlist' })
    @ApiResponse({ status: 200, description: 'wishlist fetched successfully' })
    getWishlist(@Req() req: AuthenticatedRequest) {
        return this.wishlistService.getWishlist(req.user.sub);
    }

    @Delete('items/:itemId')
    @ApiOperation({ summary: 'Delete a product from wishlist' })
    @ApiResponse({ status: 201, description: 'product removed from wishlist' })
    removeItem(
        @Req() req: AuthenticatedRequest,
        @Param('itemId') itemId: string,
    ) {
        return this.wishlistService.removeItem(req.user.sub, itemId);
    }
}
