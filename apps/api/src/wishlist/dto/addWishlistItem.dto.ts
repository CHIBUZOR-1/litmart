import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddWishlistItemDto {
    @ApiProperty({
            description: 'Product ID to add to wishlist',
            example: 'd3ca14-aafc-4147-a939-a36e6234b9',
    })
    @IsUUID()
    productId: string;
}