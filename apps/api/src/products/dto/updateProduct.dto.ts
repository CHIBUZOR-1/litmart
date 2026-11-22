import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Currency } from '../../generated/prisma/client.js';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number | null;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : Number(value))
  @IsInt()
  @Min(0)
  stock?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsBoolean()
  isNewArrival?: boolean;
}