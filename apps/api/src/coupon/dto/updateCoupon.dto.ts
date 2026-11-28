import { PartialType } from '@nestjs/mapped-types';
import { CreateCouponDto } from './createCoupon.dto.js';

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}