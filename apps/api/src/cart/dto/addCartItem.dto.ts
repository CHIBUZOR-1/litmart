import {
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';

export class AddCartItemDto {
    @IsUUID()
    productId: string;

    @IsOptional()
    @IsUUID()
    variantId?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number = 1;
}