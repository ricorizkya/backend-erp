/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ================================================================
// BRANCH & WAREHOUSE
// ================================================================

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export enum WarehouseType {
  RAW_MATERIAL = 'raw_material',
  WIP = 'wip',
  FINISHED_GOODS = 'finished_goods',
}

export class CreateWarehouseDto {
  @IsInt()
  branchId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => value?.toUpperCase().trim())
  code: string;

  @IsEnum(WarehouseType)
  type: WarehouseType;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(WarehouseType)
  type?: WarehouseType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWarehouseLocationDto {
  @IsInt()
  warehouseId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => value?.toUpperCase().trim())
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

// ================================================================
// INVENTORY MOVEMENTS
// ================================================================

export class CreateMovementItemDto {
  @IsInt()
  variantId: number;

  @IsOptional()
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsInt()
  fromWarehouseId?: number;

  @IsOptional()
  @IsInt()
  fromLocationId?: number;

  @IsOptional()
  @IsInt()
  toWarehouseId?: number;

  @IsOptional()
  @IsInt()
  toLocationId?: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateInventoryMovementDto {
  @IsString()
  @IsNotEmpty()
  movementTypeCode: string; // e.g. 'ADJUSTMENT_IN', 'TRANSFER'

  @IsOptional()
  @IsDateString()
  movementDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMovementItemDto)
  items: CreateMovementItemDto[];
}

export class MovementFilterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsString()
  movementTypeCode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  warehouseId?: number;
}

// ================================================================
// STOCK QUERY
// ================================================================

export class StockQueryDto {
  @IsOptional()
  @IsInt()
  warehouseId?: number;

  @IsOptional()
  @IsInt()
  variantId?: number;

  @IsOptional()
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  onlyPositive?: boolean = true;
}

export class StockHistoryDto {
  @IsInt()
  variantId: number;

  @IsOptional()
  @IsInt()
  warehouseId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit: number = 50;
}

// ================================================================
// STOCK OPNAME
// ================================================================

export class CreateStockOpnameDto {
  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsDateString()
  opnameDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOpnameItemDto {
  @IsInt()
  itemId: number;

  @IsNumber()
  @Min(0)
  actualQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteOpnameDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOpnameItemDto)
  items: UpdateOpnameItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
