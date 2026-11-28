import {
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import { DiscountType } from '../../generated/prisma/client.js';

export class CreateCouponDto {
    @IsString()
    @MinLength(3)
    @MaxLength(30)
    code: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;

    @IsEnum(DiscountType)
    discountType: DiscountType;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    discountValue: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    minOrderAmount?: number;

    @IsOptional()
    @IsNumber()
    @Min(1)
    @IsInt()
    maxUses?: number;

    @IsOptional()
    @IsDateString()
    startsAt?: string;

    @IsOptional()
    @IsDateString()
    expiresAt?: string;
}