import { Module } from '@nestjs/common';
import { WishlistService } from './wishlist.service.js';
import { WishlistController } from './wishlist.controller.js';

@Module({
  providers: [WishlistService],
  controllers: [WishlistController]
})
export class WishlistModule {}
