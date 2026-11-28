import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller.js';
import { CouponService } from './coupon.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
