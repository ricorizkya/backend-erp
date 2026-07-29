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
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================================================================
// SHARED
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
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

// ================================================================
// PURCHASE REQUEST (PR)
// ================================================================

export class CreatePrItemDto {
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
  estimatedPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePurchaseRequestDto {
  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsDateString()
  neededDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrItemDto)
  items: CreatePrItemDto[];
}

export class ApprovePrDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectPrDto {
  @IsString()
  @IsNotEmpty()
  rejectionNotes: string;
}

// ================================================================
// RFQ
// ================================================================

export class CreateRfqItemDto {
  @IsInt()
  variantId: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  // PR item yang menjadi sumber (opsional — bisa buat RFQ langsung)
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  prItemIds?: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRfqDto {
  @IsOptional()
  @IsDateString()
  deadlineDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRfqItemDto)
  items: CreateRfqItemDto[];
}

export class SubmitRfqQuoteItemDto {
  @IsInt()
  rfqItemId: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitRfqQuoteDto {
  @IsInt()
  supplierId: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitRfqQuoteItemDto)
  items: SubmitRfqQuoteItemDto[];
}

// ================================================================
// PURCHASE ORDER (PO)
// ================================================================

export class CreatePoItemDto {
  @IsInt()
  variantId: number;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsInt()
  uomId: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;

  // Opsional — kalau PO dari RFQ
  @IsOptional()
  @IsInt()
  rfqQuoteItemId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @IsInt()
  supplierId: number;

  @IsInt()
  warehouseId: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  // Opsional — kalau PO dari RFQ supplier quote
  @IsOptional()
  @IsInt()
  rfqSupplierQuoteId?: number;

  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  termsConditions?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePoItemDto)
  items: CreatePoItemDto[];
}

export class UpdatePoItemDto {
  @IsInt()
  itemId: number;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPct?: number;
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePoItemDto)
  items?: UpdatePoItemDto[];
}

export class CancelPoDto {
  @IsString()
  @IsNotEmpty()
  cancellationNotes: string;
}

// ================================================================
// GOODS RECEIPT (GR)
// ================================================================

export class CreateGrItemDto {
  @IsInt()
  poItemId: number;

  @IsInt()
  variantId: number;

  @IsNumber()
  @Min(0.0001)
  quantityReceived: number;

  @IsInt()
  uomId: number;

  @IsOptional()
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGoodsReceiptDto {
  @IsInt()
  poId: number;

  @IsOptional()
  @IsDateString()
  receiptDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierDoNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrItemDto)
  items: CreateGrItemDto[];
}

// ================================================================
// VENDOR INVOICE (VI)
// ================================================================

export class CreateVendorInvoiceDto {
  @IsInt()
  poId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  supplierInvoiceNo: string;

  @IsDateString()
  invoiceDate: string;

  @IsDateString()
  dueDate: string;

  // GR yang di-cover invoice ini
  @IsArray()
  @IsInt({ each: true })
  grIds: number[];

  @IsOptional()
  @IsString()
  notes?: string;
}
