// src/products/products.module.ts
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { CloudinaryModule } from '../cloudinary/cloudinary.module.js';

@Module({
  imports: [AuthModule, CloudinaryModule],
  providers: [ProductsService],
  controllers: [ProductsController]
})
export class ProductsModule {}
