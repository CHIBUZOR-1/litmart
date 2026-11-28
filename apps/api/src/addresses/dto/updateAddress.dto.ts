import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './createAddress.dto.js';

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}