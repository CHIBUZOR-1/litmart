import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../generated/prisma/enums.js';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindProductsDto {
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, default: 12, minimum: 1, maximum: 100, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 12;

  @ApiPropertyOptional({ type: String, example: 'Samsung Galaxy' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', example: 'a0c733bd-45ba-4b92-98c7-005fc94da944' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, example: 1500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: Currency, example: Currency.NGN })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ enum: ['newest', 'oldest', 'name_asc', 'name_desc'], default: 'newest' })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'name_asc', 'name_desc'])
  sortBy?: 'newest' | 'oldest' | 'name_asc' | 'name_desc' = 'newest';
}