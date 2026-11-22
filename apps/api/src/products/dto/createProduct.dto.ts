import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsNumber,
  IsEnum,
  IsInt,
  Min,
  IsPositive,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../generated/prisma/client.js';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number | null;

  @IsOptional()
  @IsEnum(Currency)
  currency: Currency | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsBoolean()
  isNewArrival?: boolean;
}