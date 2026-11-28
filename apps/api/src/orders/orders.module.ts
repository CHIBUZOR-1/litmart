import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module.js';
import { CouponModule } from '../coupon/coupon.module.js';

@Module({
  imports: [AuthModule, ExchangeRatesModule, CouponModule],
  providers: [OrdersService],
  controllers: [OrdersController]
})
export class OrdersModule {}
