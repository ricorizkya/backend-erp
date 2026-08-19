import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  MaxLength,
  IsBoolean,
  IsEnum,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ================================================================
// FISCAL YEAR & PERIODS
// ================================================================

export class CreateFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class CreateAccountingPeriodDto {
  @IsInt()
  @Min(1)
  fiscalYearId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsInt()
  @Min(1)
  @Max(12)
  periodNumber: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export enum PeriodStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  LOCKED = 'locked',
}

export class UpdatePeriodStatusDto {
  @IsEnum(PeriodStatus)
  status: PeriodStatus;
}

// ================================================================
// CHART OF ACCOUNTS
// ================================================================

export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
  COST_OF_GOODS = 'cost_of_goods',
}

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  parentId?: number;

  @IsEnum(AccountType)
  accountType: AccountType;

  @IsOptional()
  @IsString()
  accountGroup?: string;

  @IsOptional()
  @IsBoolean()
  isHeader?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAccountDto {
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
// JOURNAL ENTRIES
// ================================================================

export enum JournalEntryType {
  GENERAL = 'general',
  PURCHASE = 'purchase',
  SALES = 'sales',
  PAYMENT = 'payment',
  INVENTORY = 'inventory',
  PRODUCTION = 'production',
  COST_OF_GOODS = 'cost_of_goods',
  ADJUSTMENT = 'adjustment',
  CLOSING = 'closing',
}

export class CreateJournalLineDto {
  @IsInt()
  @Min(1)
  accountId: number;

  @IsInt()
  @Min(1)
  lineNumber: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  costCenter?: string;
}

export class CreateJournalEntryDto {
  @IsInt()
  @Min(1)
  periodId: number;

  @IsDateString()
  entryDate: string;

  @IsEnum(JournalEntryType)
  entryType: JournalEntryType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  folio?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  referenceId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJournalLineDto)
  lines: CreateJournalLineDto[];
}

export class ReverseJournalDto {
  @IsInt()
  @Min(1)
  periodId: number;
}

// ================================================================
// AP PAYMENTS
// ================================================================

export enum PaymentMethod {
  CASH = 'cash',
  TRANSFER = 'transfer',
  CHEQUE = 'cheque',
  GIRO = 'giro',
  OTHER = 'other',
}

export class ApPaymentAllocationDto {
  @IsInt()
  @Min(1)
  apTransactionId: number;

  @IsNumber()
  @Min(0.0001)
  amount: number;
}

export class CreateApPaymentDto {
  @IsInt()
  @Min(1)
  supplierId: number;

  @IsDateString()
  paymentDate: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsInt()
  @Min(1)
  bankAccountId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApPaymentAllocationDto)
  allocations: ApPaymentAllocationDto[];
}

// ================================================================
// BANK
// ================================================================

export class CreateBankAccountDto {
  @IsInt()
  @Min(1)
  accountId: number; // CoA account

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchName?: string;
}

export class CreateBankTransactionDto {
  @IsInt()
  @Min(1)
  bankAccountId: number;

  @IsDateString()
  transactionDate: string;

  @IsEnum({ DEBIT: 'debit', CREDIT: 'credit' })
  transactionType: 'debit' | 'credit';

  @IsNumber()
  @Min(0.0001)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNo?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BankReconciliationDto {
  @IsInt()
  @Min(1)
  bankAccountId: number;

  @IsInt()
  @Min(1)
  periodId: number;

  @IsDateString()
  reconciliationDate: string;

  @IsNumber()
  statementBalance: number;

  @IsNumber()
  bookBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ================================================================
// TAX
// ================================================================

export class CreateTaxCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum({ PPN: 'ppn', PPH: 'pph' })
  taxType: 'ppn' | 'pph';

  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @IsInt()
  @Min(1)
  accountId: number;
}

// ================================================================
// OVERHEAD RATES
// ================================================================

export class CreateOverheadRateDto {
  @IsInt()
  @Min(1)
  periodId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum({
    PER_UNIT: 'per_unit',
    PER_LABOR_HOUR: 'per_labor_hour',
    PER_MACHINE_HOUR: 'per_machine_hour',
    PERCENTAGE: 'percentage',
  })
  rateType: 'per_unit' | 'per_labor_hour' | 'per_machine_hour' | 'percentage';

  @IsNumber()
  @Min(0)
  rate: number;

  @IsInt()
  @Min(1)
  accountId: number;
}

// ================================================================
// FILTERS & PAGINATION
// ================================================================

export class JournalFilterDto {
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
  @IsInt()
  @Min(1)
  @Type(() => Number)
  periodId?: number;

  @IsOptional()
  @IsString()
  entryType?: string;

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
  @IsString()
  search?: string;
}

export class GlQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  accountId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  periodId?: number;

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
  @Max(100)
  @Type(() => Number)
  limit: number = 20;
}

export class AccountFilterDto {
  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isHeader?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
