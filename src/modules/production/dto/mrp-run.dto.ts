import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MrpRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  FAILED_PERMANENT = 'failed_permanent',
}

export enum PlannedOrderStatus {
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  CANCELLED = 'cancelled',
}

export enum PlannedOrderType {
  PRODUCTION = 'production',
  PURCHASE = 'purchase',
}

export class TriggerMrpRunDto {
  @IsDateString()
  @IsNotEmpty()
  planFrom: string;

  @IsDateString()
  @IsNotEmpty()
  planTo: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MrpRunFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(MrpRunStatus)
  status?: MrpRunStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class PlannedOrderFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mrpRunId?: number;

  @IsOptional()
  @IsEnum(PlannedOrderType)
  orderType?: PlannedOrderType;

  @IsOptional()
  @IsEnum(PlannedOrderStatus)
  status?: PlannedOrderStatus;
}
