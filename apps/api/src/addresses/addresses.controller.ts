import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from '../auth/guards/access.guard.js';
import { AddressesService } from './addresses.service.js';
import type { Request } from 'express';
import { CreateAddressDto } from './dto/createAddress.dto.js';
import { UpdateAddressDto } from './dto/updateAddress.dto.js';

type AuthenticatedRequest = Request & {
    user: {
        sub: string;
    };
};

@Controller('addresses')
@UseGuards(AccessGuard)
export class AddressesController {
    constructor( private readonly addressesService: AddressesService, ) {}

    // Create an address
    @Post()
    create( @Body() dto: CreateAddressDto, @Req() req: AuthenticatedRequest, ) {
        return this.addressesService.create(
            req.user.sub,
            dto,
        );
    }

    // Get all addresses
    @Get()
    findAll(@Req() req: AuthenticatedRequest) {
        return this.addressesService.findAll(req.user.sub);
    }

    // Get a single address
    @Get(':addressId')
    findOne(
        @Param('addressId') addressId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.addressesService.findOne(
            req.user.sub,
            addressId,
        );
    }

    // Set an address as default
    @Patch(':addressId/default')
    setDefault(
        @Param('addressId') addressId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.addressesService.setDefault(
            req.user.sub,
            addressId,
        );
    }

    // Update an address
    @Patch(':addressId')
    update(
        @Param('addressId') addressId: string,
        @Body() dto: UpdateAddressDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.addressesService.update(
            req.user.sub,
            addressId,
            dto,
        );
    }

    // Delete an address
    @Delete(':addressId')
    remove(
        @Param('addressId') addressId: string,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.addressesService.remove(
            req.user.sub,
            addressId,
        );
    }
}
