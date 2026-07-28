import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  MaxLength,
  IsArray,
  ValidateNested,
  IsEnum,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ================================================================
// PAGINATION & FILTER BASE
// ================================================================

export class PaginationDto {
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
  search?: string;
}

// ================================================================
// UOM
// ================================================================

export class CreateUomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  symbol: string;
}

export class UpdateUomDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  symbol?: string;
}

export class CreateUomConversionDto {
  @IsInt()
  fromUomId: number;

  @IsInt()
  toUomId: number;

  @IsNumber()
  @Min(0.000001)
  factor: number;
}

// ================================================================
// PRODUCT CATEGORY
// ================================================================

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsInt()
  parentId?: number;
}

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsInt()
  parentId?: number;
}

// ================================================================
// ATTRIBUTES
// ================================================================

export class CreateAttributeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class CreateAttributeValueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;
}

// ================================================================
// PRODUCT VARIANT
// ================================================================

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  // Kombinasi attribute value IDs untuk variant ini
  // e.g. [uuid_merah, uuid_xl]
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  attributeValueIds?: number[];
}

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ================================================================
// PRODUCT
// ================================================================

export class CreateProductDto {
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.toUpperCase().trim())
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsInt()
  description?: string;

  @IsInt()
  baseUomId: number;

  @IsInt()
  purchaseUomId: number;

  @IsInt()
  salesUomId: number;

  @IsOptional()
  @IsBoolean()
  canBePurchased?: boolean = true;

  @IsOptional()
  @IsBoolean()
  canBeSold?: boolean = true;

  @IsOptional()
  @IsBoolean()
  canBeManufactured?: boolean = false;

  @IsOptional()
  @IsBoolean()
  hasVariant?: boolean = false;

  // Kalau hasVariant = false, satu default variant dibuat otomatis
  // Kalau hasVariant = true, variants dikirim sekaligus
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsInt()
  description?: string;

  @IsOptional()
  @IsInt()
  baseUomId?: number;

  @IsOptional()
  @IsInt()
  purchaseUomId?: number;

  @IsOptional()
  @IsInt()
  salesUomId?: number;

  @IsOptional()
  @IsBoolean()
  canBePurchased?: boolean;

  @IsOptional()
  @IsBoolean()
  canBeSold?: boolean;

  @IsOptional()
  @IsBoolean()
  canBeManufactured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductFilterDto extends PaginationDto {
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  canBePurchased?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  canBeSold?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  canBeManufactured?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean = true;
}

// ================================================================
// BATCHES
// ================================================================

export class CreateBatchDto {
  @IsInt()
  variantId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  batchNumber: string;

  @IsOptional()
  @IsString()
  manufactureDate?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  origin?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
