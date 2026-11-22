// src/cart/controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { AddCartItemDto } from './dto/addCartItem.dto.js';

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
}
