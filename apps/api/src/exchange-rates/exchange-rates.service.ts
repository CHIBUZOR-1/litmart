import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Currency } from '../generated/prisma/enums.js';

@Injectable()
export class ExchangeRatesService {
    constructor(private readonly prisma: PrismaService) {}


    // Get the current USD to NGN exchange rate
    async findCurrent() {
        const exchangeRate = await this.prisma.exchangeRate.findUnique({
            where: {
                baseCurrency_targetCurrency: {
                    baseCurrency: Currency.USD,
                    targetCurrency: Currency.NGN,
                },
            },
        });

        if (!exchangeRate) {
            throw new BadRequestException(
                'USD to NGN exchange rate has not been configured',
            );
        }

        return exchangeRate;
    }

    // Create or update the USD to NGN exchange rate
    async update(rate: number) {
        if (!Number.isFinite(rate) || rate <= 0) {
            throw new BadRequestException(
                'Exchange rate must be a positive number',
            );
        }

        return this.prisma.exchangeRate.upsert({
            where: {
                baseCurrency_targetCurrency: {
                    baseCurrency: Currency.USD,
                    targetCurrency: Currency.NGN,
                },
            },
            create: {
                baseCurrency: Currency.USD,
                targetCurrency: Currency.NGN,
                rate,
            },
            update: {
                rate,
            },
        });
    }
}
