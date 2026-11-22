// src/cart/cart.module.ts
import { Module } from '@nestjs/common';
import { CartService } from './cart.service.js';
import { CartController } from './cart.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  providers: [CartService],
  controllers: [CartController]
})
export class CartModule {}
