import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsEnum,
  MaxLength,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================================================================
// QC PARAMETERS
// ================================================================

export enum QcValueType {
  PASS_FAIL = 'pass_fail',
  NUMERIC = 'numeric',
  TEXT = 'text',
}

export class CreateQcParameterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(QcValueType)
  valueType: QcValueType;

  @IsOptional()
  @IsNumber()
  minValue?: number;

  @IsOptional()
  @IsNumber()
  maxValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;
}

// ================================================================
// QC CHECKLISTS
// ================================================================

export enum InspectionType {
  INCOMING = 'incoming',
  FINAL = 'final',
}

export class CreateQcChecklistItemDto {
  @IsInt()
  parameterId: number;

  @IsInt()
  @Min(0)
  sequence: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQcChecklistDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(InspectionType)
  inspectionType: InspectionType;

  @IsOptional()
  @IsInt()
  productCategoryId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQcChecklistItemDto)
  items: CreateQcChecklistItemDto[];
}

// ================================================================
// QC DEFECT TYPES
// ================================================================

export enum DefectSeverity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor',
}

export class CreateDefectTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEnum(DefectSeverity)
  severity: DefectSeverity;
}

// ================================================================
// QC INSPECTIONS
// ================================================================

export class CreateQcInspectionDto {
  @IsInt()
  checklistId: number;

  @IsEnum(InspectionType)
  inspectionType: InspectionType;

  // Incoming QC — wajib jika inspection_type = 'incoming'
  @IsOptional()
  @IsInt()
  goodsReceiptId?: number;

  // Final QC — wajib jika inspection_type = 'final'
  @IsOptional()
  @IsInt()
  productionResultId?: number;

  @IsInt()
  variantId: number;

  @IsOptional()
  @IsInt()
  batchId?: number;

  @IsNumber()
  @Min(0.0001)
  quantityToInspect: number;

  @IsInt()
  uomId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// INSPECTION ITEMS (hasil per parameter)
// ================================================================

export class SubmitInspectionItemDto {
  @IsInt()
  checklistItemId: number;

  @IsInt()
  parameterId: number;

  // Isi salah satu sesuai value_type parameter
  @IsOptional()
  @IsBoolean()
  passFailValue?: boolean;

  @IsOptional()
  @IsNumber()
  numericValue?: number;

  @IsOptional()
  @IsString()
  textValue?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// DEFECTS
// ================================================================

export enum DefectDisposition {
  PENDING = 'pending',
  REWORK = 'rework',
  REJECT = 'reject',
  ACCEPT_AS_IS = 'accept_as_is',
}

export class AddDefectDto {
  @IsInt()
  defectTypeId: number;

  @IsNumber()
  @Min(0.0001)
  quantityDefective: number;

  @IsOptional()
  @IsInt()
  uomId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DefectDisposition)
  disposition: DefectDisposition;
}

// ================================================================
// COMPLETE INSPECTION
// ================================================================

export enum InspectionResult {
  PASSED = 'passed',
  PASSED_WITH_NOTE = 'passed_with_note',
  FAILED = 'failed',
}

export enum InspectionDisposition {
  ACCEPTED = 'accepted',
  ACCEPTED_WITH_DEBIT = 'accepted_with_debit',
  REWORK = 'rework',
  REJECTED = 'rejected',
  PENDING = 'pending',
}

export class CompleteInspectionDto {
  @IsNumber()
  @Min(0)
  quantityInspected: number;

  @IsEnum(InspectionResult)
  result: InspectionResult;

  @IsEnum(InspectionDisposition)
  disposition: InspectionDisposition;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitInspectionItemDto)
  items: SubmitInspectionItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddDefectDto)
  defects?: AddDefectDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// FILTERS
// ================================================================

export class QcInspectionFilterDto {
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
  @IsEnum(InspectionType)
  inspectionType?: InspectionType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  variantId?: number;
}
