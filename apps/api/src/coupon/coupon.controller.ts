import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CouponService } from './coupon.service.js';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';
import { CreateCouponDto } from './dto/createCoupon.dto.js';
import { UpdateCouponDto } from './dto/updateCoupon.dto.js';
import { UpdateCouponStatusDto } from './dto/updateCouponStatus.dto.js';
import { ValidateCouponDto } from './dto/validateCoupon.dto.js';

@Controller('coupon')
@UseGuards(AccessGuard)
export class CouponController {
    constructor( private readonly couponService: CouponService) {}

    // Create a coupon (Admin only)
    @Post()
    @Roles(Role.ADMIN)
    create(@Body() dto: CreateCouponDto) {
        return this.couponService.create(dto);
    }

    // Get all coupons (Admin only)
    @Get()
    @Roles(Role.ADMIN)
    findAll() {
        return this.couponService.findAll();
    }

    @Get(':couponId')
    @Roles(Role.ADMIN)
    findOne(@Param('couponId') couponId: string) {
        return this.couponService.findOne(couponId);
    }

    // Update a coupon (Admin only)
    @Patch(':couponId')
    @Roles(Role.ADMIN)
    update(
        @Param('couponId') couponId: string,
        @Body() dto: UpdateCouponDto,
    ) {
        return this.couponService.update(couponId, dto);
    }

    // Update coupon status (Admin only)
    @Patch(':couponId/status')
    @Roles(Role.ADMIN)
    updateStatus(
        @Param('couponId') couponId: string,
        @Body() dto: UpdateCouponStatusDto,
    ) {
        return this.couponService.updateStatus(couponId, dto);
    }

    // Delete a coupon (Admin only)
    @Delete(':couponId')
    @Roles(Role.ADMIN)
    remove(@Param('couponId') couponId: string) {
        return this.couponService.remove(couponId);
    }

    @Post('validate')
    validateCoupon(@Body() dto: ValidateCouponDto) {
        return this.couponService.validateCoupon(dto);
    }
}
