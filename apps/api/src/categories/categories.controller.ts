// src/categories/categories.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/createCategory.dto.js';
import { UpdateCategoryDto } from './dto/updateCategory.dto.js';
import { UpdateCategoryStatusDto } from './dto/updateCategoryStatus.dto.js';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';

@Controller('categories')
export class CategoriesController {
    constructor(private readonly categoriesService: CategoriesService) {}

    @UseGuards(AccessGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Post()
    create(@Body() dto: CreateCategoryDto) {
        return this.categoriesService.create(dto);
    }

    @Get()
    findAll() {
        return this.categoriesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.categoriesService.findOne(id);
    }

    @UseGuards(AccessGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Patch(':id')
    update( @Param('id') id: string, @Body() dto: UpdateCategoryDto, ) {
        return this.categoriesService.update(id, dto);
    }

    @Roles(Role.ADMIN)
    @Patch(':id/status')
    updateStatus( @Param('id') id: string, @Body() dto: UpdateCategoryStatusDto, ) {
        return this.categoriesService.updateStatus(id, dto);
    }

    @UseGuards(AccessGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @Delete(':id')
    remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
    }
}
