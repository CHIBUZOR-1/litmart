// src/orders/orders.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/createOrder.dto.js';

type AuthenticatedRequest = Request & {
    user: {
        sub: string;
    };
};

@Controller('orders')
@UseGuards(AccessGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) {}

    @Post()
    async createOrder(
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateOrderDto,
    ) {
        return this.ordersService.createOrder(req.user.sub, dto);
    }

    @Get()
    async findAll(@Req() req: AuthenticatedRequest) {
        return this.ordersService.findAll(req.user.sub);
    }

    @Get(':orderId')
    async findOne(
        @Req() req: AuthenticatedRequest,
        @Param('orderId') orderId: string,
    ) {
        return this.ordersService.findOne(req.user.sub, orderId);
    }

    @Patch(':orderId/cancel')
    async cancelOrder(
        @Req() req: AuthenticatedRequest,
        @Param('orderId') orderId: string,
    ) {
        return this.ordersService.cancelOrder(req.user.sub, orderId);
    }
}
