import {
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';
import { Currency } from '../../generated/prisma/enums.js';

export class CreateOrderDto {
    @IsUUID()
    addressId: string;

    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(30)
    couponCode?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    shippingMethod?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    notes?: string;

    @IsEnum(Currency)
    currency: Currency;
}