import { IsNumber, IsPositive, Max, Min } from 'class-validator';

export class UpdateExchangeRateDto {
    @IsNumber({ maxDecimalPlaces: 6 })
    @IsPositive()
    @Min(1)
    @Max(1000000)
    rate: number;
}