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
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page: number = 1;
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit: number = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsInt() customerId?: number;
}

export class CreateSqItemDto {
  @IsInt() variantId: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsInt() uomId: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxPct?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSalesQuotationDto {
  @IsInt() customerId: number;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermDays?: number;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() termsConditions?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateSqItemDto)
  items: CreateSqItemDto[];
}

export class UpdateSalesQuotationDto {
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermDays?: number;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSoItemDto {
  @IsInt() variantId: number;
  @IsNumber() @Min(0.0001) quantity: number;
  @IsInt() uomId: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) taxPct?: number;
  @IsOptional() @IsInt() quotationItemId?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSalesOrderDto {
  @IsInt() customerId: number;
  @IsInt() warehouseId: number;
  @IsOptional() @IsInt() quotationId?: number;
  @IsOptional() @IsDateString() requestedDate?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermDays?: number;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() termsConditions?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateSoItemDto)
  items: CreateSoItemDto[];
}

export class CancelSoDto {
  @IsString() @IsNotEmpty() cancellationNotes: string;
}

export class CreateDoItemDto {
  @IsInt() soItemId: number;
  @IsInt() variantId: number;
  @IsNumber() @Min(0.0001) quantityDelivered: number;
  @IsInt() uomId: number;
  @IsOptional() @IsInt() batchId?: number;
  @IsOptional() @IsInt() locationId?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateDeliveryOrderDto {
  @IsInt() soId: number;
  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsString() @MaxLength(255) receiverName?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateDoItemDto)
  items: CreateDoItemDto[];
}

export class CreateCustomerInvoiceDto {
  @IsInt() soId: number;
  @IsDateString() invoiceDate: string;
  @IsDateString() dueDate: string;
  @IsArray() @IsInt({ each: true }) doIds: number[];
  @IsOptional() @IsString() notes?: string;
}

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CHEQUE = 'cheque',
  GIRO = 'giro',
  OTHER = 'other',
}

export class AllocatePaymentDto {
  @IsInt() invoiceId: number;
  @IsNumber() @Min(0.0001) amount: number;
}

export class CreatePaymentReceiptDto {
  @IsInt() customerId: number;
  @IsOptional() @IsDateString() paymentDate?: string;
  @IsEnum(PaymentMethod) paymentMethod: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AllocatePaymentDto)
  allocations: AllocatePaymentDto[];
}
