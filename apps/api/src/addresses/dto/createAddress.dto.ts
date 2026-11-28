import {
    IsBoolean,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateAddressDto {
    @IsOptional()
    @IsString()
    @MaxLength(50)
    label?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    firstName: string;

    @IsString()
    @MinLength(2)
    @MaxLength(50)
    lastName: string;

    @IsString()
    @MinLength(7)
    @MaxLength(20)
    phone: string;

    @IsString()
    @MinLength(5)
    @MaxLength(150)
    addressLine1: string;

    @IsOptional()
    @IsString()
    @MaxLength(150)
    addressLine2?: string;

    @IsString()
    @MinLength(2)
    @MaxLength(80)
    city: string;

    @IsString()
    @MinLength(2)
    @MaxLength(80)
    state: string;

    @IsOptional()
    @IsString()
    @MaxLength(80)
    country?: string = 'Nigeria';

    @IsOptional()
    @IsString()
    @MaxLength(20)
    postalCode?: string;

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean = false;
}