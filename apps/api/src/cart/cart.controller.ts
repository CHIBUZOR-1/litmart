// src/cart/controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { AddCartItemDto } from './dto/addCartItem.dto.js';
import { UpdateCartItemDto } from './dto/updateCartItem.dto.js';

type AuthenticatedRequest = Request & {
    user: {
        sub: string;
    };
};

@Controller('cart')
@UseGuards(AccessGuard)
export class CartController {
    constructor(private readonly cartService: CartService) {}

    @Post('items')
    addItem(
        @Req() req: AuthenticatedRequest,
        @Body() dto: AddCartItemDto,
    ) {
        return this.cartService.addItem(req.user.sub, dto);
    }

    @Get()
    getCart(@Req() req: AuthenticatedRequest) {
        return this.cartService.getCart(req.user.sub);
    }

    @Patch('items/:itemId')
    updateItem(
        @Req() req: AuthenticatedRequest,
        @Param('itemId') itemId: string,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(
            req.user.sub,
            itemId,
            dto,
        );
    }

    @Delete('items/:itemId')
    removeItem(
        @Req() req: AuthenticatedRequest,
        @Param('itemId') itemId: string,
    ) {
        return this.cartService.removeItem(
            req.user.sub,
            itemId,
        );
    }

    @Patch('items/:itemId/increment')
    incrementItem(
        @Req() req: AuthenticatedRequest,
        @Param('itemId') itemId: string,
    ) {
        return this.cartService.incrementItem(req.user.sub, itemId);
    }

    @Patch('items/:itemId/decrement')
    decrementItem(
        @Req() req: AuthenticatedRequest,
        @Param('itemId') itemId: string,
    ) {
        return this.cartService.decrementItem(req.user.sub, itemId);
    }
}
