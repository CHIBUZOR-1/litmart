import { ApiProperty } from '@nestjs/swagger';
import {
    IsInt,
    Min,
} from 'class-validator';

export class UpdateCartItemDto {
    @ApiProperty({
        description: 'Cart quantity (minimum 1 characters)',
        example: '4',
        minLength: 1
    })
    @IsInt()
    @Min(1)
    quantity: number;
}