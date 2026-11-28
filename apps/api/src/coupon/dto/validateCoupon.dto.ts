import {
    IsNumber,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class ValidateCouponDto {
    @IsString()
    @MinLength(3)
    @MaxLength(30)
    code: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0.01)
    subtotal: number;
}