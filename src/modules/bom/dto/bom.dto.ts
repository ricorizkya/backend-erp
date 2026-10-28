import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsInt,
  IsDateString,
  MaxLength,
  IsBoolean,
  IsEnum,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================================================================
// BOM HEADER
// ================================================================

export class CreateBomHeaderDto {
  @IsInt()
  variantId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomHeaderDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ================================================================
// BOM VERSION
// ================================================================

export class CreateBomVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  versionName?: string;

  @IsNumber()
  @Min(0.0001)
  outputQuantity: number;

  @IsInt()
  outputUomId: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  versionName?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// BOM ITEMS (komponen — rekursif)
// ================================================================

export class CreateBomItemDto {
  // Null = level 1 (langsung di bawah output)
  @IsOptional()
  @IsInt()
  parentItemId?: number;

  @IsInt()
  variantId: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scrapPct?: number;

  @IsOptional()
  @IsBoolean()
  isPhantom?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @IsOptional()
  @IsInt()
  uomId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scrapPct?: number;

  @IsOptional()
  @IsBoolean()
  isPhantom?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// BOM OPERATIONS
// ================================================================

export class CreateBomOperationDto {
  @IsInt()
  @Min(1)
  sequence: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workCenter?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerMinute?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomOperationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sequence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workCenter?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerMinute?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// BY-PRODUCTS
// ================================================================

export enum ByProductType {
  BY_PRODUCT = 'by_product',
  SCRAP = 'scrap',
  CO_PRODUCT = 'co_product',
}

export class CreateByProductDto {
  @IsInt()
  variantId: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsEnum(ByProductType)
  type: ByProductType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  costSharePct?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// QUERY FILTERS
// ================================================================

export class BomFilterDto {
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
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}
