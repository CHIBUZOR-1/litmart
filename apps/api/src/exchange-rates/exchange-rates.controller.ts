import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service.js';
import { Role, Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UpdateExchangeRateDto } from './dto/updateExchangeRate.dto.js';
import { AccessGuard } from '../auth/guards/access.guard.js';

@Controller('exchange-rates')
@UseGuards(AccessGuard)
export class ExchangeRatesController {
    constructor( private readonly exchangeRatesService: ExchangeRatesService, ) {}

    // Get current exchange rate (authenticated users)
    @Get()
    findCurrent() {
        return this.exchangeRatesService.findCurrent();
    }

    // Update exchange rate (admin only)
    @Patch()
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    update(@Body() dto: UpdateExchangeRateDto) {
        return this.exchangeRatesService.update(dto.rate);
    }
}
