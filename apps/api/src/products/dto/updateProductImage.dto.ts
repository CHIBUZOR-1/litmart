import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProductImageDto {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    altText?: string | null;
}