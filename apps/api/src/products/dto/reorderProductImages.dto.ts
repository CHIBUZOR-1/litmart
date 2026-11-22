import { ArrayMinSize, IsArray, IsUUID, ArrayUnique } from 'class-validator';

export class ReorderProductImagesDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayUnique()
    @IsUUID('4', { each: true })
    imageIds: string[];
}