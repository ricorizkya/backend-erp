import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsInt,
  IsDateString,
  MaxLength,
  IsEnum,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================================================================
// MRP DEMAND
// ================================================================

export enum DemandType {
  SALES_ORDER = 'sales_order',
  FORECAST = 'forecast',
  SAFETY_STOCK = 'safety_stock',
}

export class CreateMrpDemandDto {
  @IsInt()
  variantId: number;

  @IsEnum(DemandType)
  demandType: DemandType;

  @IsOptional()
  @IsInt()
  soId?: number;

  @IsOptional()
  @IsInt()
  soItemId?: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsDateString()
  neededDate: string;

  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// WORK ORDER
// ================================================================

export enum ProductionType {
  MTS = 'mts',
  MTO = 'mto',
}

export class CreateWorkOrderDto {
  @IsInt()
  variantId: number;

  @IsInt()
  bomVersionId: number;

  @IsNumber()
  @Min(0.0001)
  quantityPlanned: number;

  @IsInt()
  uomId: number;

  @IsInt()
  outputWarehouseId: number;

  @IsDateString()
  plannedStart: string;

  @IsDateString()
  plannedFinish: string;

  @IsEnum(ProductionType)
  productionType: ProductionType;

  // MTO — link ke SO
  @IsOptional()
  @IsInt()
  soId?: number;

  @IsOptional()
  @IsInt()
  soItemId?: number;

  // Dari planned order MRP
  @IsOptional()
  @IsInt()
  plannedOrderId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWorkOrderDto {
  @IsOptional()
  @IsDateString()
  plannedStart?: string;

  @IsOptional()
  @IsDateString()
  plannedFinish?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantityPlanned?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// MATERIAL CONSUMPTION
// ================================================================

export class ConsumeMaterialItemDto {
  @IsInt()
  woMaterialId: number;

  @IsNumber()
  @Min(0.0001)
  quantityConsumed: number;

  @IsOptional()
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsInt()
  warehouseId?: number;
}

export class ConsumeMaterialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsumeMaterialItemDto)
  items: ConsumeMaterialItemDto[];
}

// ================================================================
// PRODUCTION RESULT
// ================================================================

export class CreateProductionResultDto {
  @IsNumber()
  @Min(0.0001)
  quantityProduced: number;

  @IsInt()
  uomId: number;

  @IsInt()
  warehouseId: number;

  // Batch baru yang dibuat dari hasil produksi
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// WORK ORDER OPERATION
// ================================================================

export class StartOperationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteOperationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// FILTERS
// ================================================================

export class WorkOrderFilterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(ProductionType)
  productionType?: ProductionType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  variantId?: number;
}

export class MrpDemandFilterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(DemandType)
  demandType?: DemandType;

  @IsOptional()
  @IsDateString()
  neededDateFrom?: string;

  @IsOptional()
  @IsDateString()
  neededDateTo?: string;
}
