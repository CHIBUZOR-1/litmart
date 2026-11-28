// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { EmailModule } from './email/email.module.js';
import { ProductsModule } from './products/products.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CloudinaryModule } from './cloudinary/cloudinary.module.js';
import { CartModule } from './cart/cart.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { AddressesModule } from './addresses/addresses.module.js';
import { CouponModule } from './coupon/coupon.module.js';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module.js';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ ConfigModule.forRoot({
      isGlobal: true,
    }), ScheduleModule.forRoot(),
    PrismaModule, 
    AuthModule, 
    UsersModule, EmailModule, ProductsModule, CategoriesModule, CloudinaryModule, CartModule, WishlistModule, OrdersModule, PaymentsModule, ReviewsModule, AddressesModule, CouponModule, ExchangeRatesModule],
})
export class AppModule {}
