import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../types/database.types';
import { TenantDb } from '../../common/decorators/tenant-db.decorator';
import { HashIdPipe } from '../../common/hashid';
import {
  JwtAuthGuard,
  PermissionGuard,
  RequirePermission,
} from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { MODULES, ACTIONS } from '../auth/auth.constants';

import { FiscalPeriodService } from './services/fiscal-period.service';
import { AccountService } from './services/account.service';
import { JournalEntryService } from './services/journal-entry.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { ApService } from './services/ap.service';
import { ArService } from './services/ar.service';
import { BankService } from './services/bank.service';

import {
  CreateFiscalYearDto,
  CreateAccountingPeriodDto,
  UpdatePeriodStatusDto,
  CreateAccountDto,
  UpdateAccountDto,
  AccountFilterDto,
  CreateJournalEntryDto,
  JournalFilterDto,
  ReverseJournalDto,
  GlQueryDto,
  CreateApPaymentDto,
  CreateBankAccountDto,
  CreateBankTransactionDto,
  BankReconciliationDto,
  CreateTaxCodeDto,
  CreateOverheadRateDto,
} from './dto/accounting.dto';

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class AccountingController {
  constructor(
    private readonly periodService: FiscalPeriodService,
    private readonly accountService: AccountService,
    private readonly journalService: JournalEntryService,
    private readonly glService: GeneralLedgerService,
    private readonly apService: ApService,
    private readonly arService: ArService,
    private readonly bankService: BankService,
  ) {}

  // ================================================================
  // FISCAL YEARS
  // ================================================================

  @Get('fiscal-years')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findAllFiscalYears(@TenantDb() db: Kysely<TenantSchema>) {
    return this.periodService.findAllFiscalYears(db);
  }

  @Get('fiscal-years/:id')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findOneFiscalYear(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.periodService.findOneFiscalYear(db, id);
  }

  @Post('fiscal-years')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createFiscalYear(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateFiscalYearDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.periodService.createFiscalYear(db, dto, user.userId);
  }

  @Post('fiscal-years/:id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.APPROVE)
  closeFiscalYear(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.periodService.closeFiscalYear(db, id);
  }

  // ================================================================
  // ACCOUNTING PERIODS
  // ================================================================

  @Get('accounting-periods')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findAllPeriods(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('fiscalYearId', HashIdPipe) fiscalYearId?: number,
  ) {
    return this.periodService.findAllPeriods(db, fiscalYearId);
  }

  @Post('accounting-periods')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createPeriod(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateAccountingPeriodDto,
  ) {
    return this.periodService.createPeriod(db, dto);
  }

  @Patch('accounting-periods/:id/status')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.APPROVE)
  updatePeriodStatus(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdatePeriodStatusDto,
  ) {
    return this.periodService.updatePeriodStatus(db, id, dto);
  }

  // ================================================================
  // CHART OF ACCOUNTS
  // ================================================================

  @Get('accounts')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findAllAccounts(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: AccountFilterDto,
  ) {
    return this.accountService.findAll(db, filter);
  }

  @Get('accounts/:id')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findOneAccount(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.accountService.findOne(db, id);
  }

  @Post('accounts')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createAccount(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountService.create(db, dto);
  }

  @Patch('accounts/:id')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  updateAccount(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountService.update(db, id, dto);
  }

  // ================================================================
  // JOURNAL ENTRIES
  // ================================================================

  @Get('journal-entries')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findAllJournals(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: JournalFilterDto,
  ) {
    return this.journalService.findAll(db, filter);
  }

  @Get('journal-entries/:id')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findOneJournal(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.journalService.findOne(db, id);
  }

  @Post('journal-entries')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createJournal(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.create(db, dto, user.userId);
  }

  @Post('journal-entries/:id/post')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.APPROVE)
  postJournal(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.post(db, id, user.userId);
  }

  @Post('journal-entries/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.APPROVE)
  reverseJournal(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: ReverseJournalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journalService.reverse(db, id, user.userId, dto.periodId);
  }

  // ================================================================
  // GENERAL LEDGER & REPORTS
  // ================================================================

  @Get('general-ledger')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  getGlEntries(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() query: GlQueryDto,
  ) {
    return this.glService.findGlEntries(db, query);
  }

  @Get('account-balances')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  getAccountBalances(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId: number,
  ) {
    return this.glService.getAccountBalances(db, periodId);
  }

  @Get('reports/trial-balance')
  @RequirePermission(MODULES.REPORTING, ACTIONS.READ)
  getTrialBalance(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId: number,
  ) {
    return this.glService.getTrialBalance(db, periodId);
  }

  @Get('reports/profit-loss')
  @RequirePermission(MODULES.REPORTING, ACTIONS.READ)
  getProfitLoss(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId: number,
  ) {
    return this.glService.getProfitLoss(db, periodId);
  }

  @Get('reports/balance-sheet')
  @RequirePermission(MODULES.REPORTING, ACTIONS.READ)
  getBalanceSheet(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId: number,
  ) {
    return this.glService.getBalanceSheet(db, periodId);
  }

  @Get('reports/cash-flow')
  @RequirePermission(MODULES.REPORTING, ACTIONS.READ)
  getCashFlow(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId: number,
  ) {
    return this.glService.getCashFlow(db, periodId);
  }

  // ================================================================
  // ACCOUNTS PAYABLE
  // ================================================================

  @Get('ap-transactions')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findApTransactions(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('supplierId', HashIdPipe) supplierId?: number,
    @Query('status') status?: string,
  ) {
    return this.apService.findAllTransactions(db, supplierId, status);
  }

  @Get('ap-transactions/aging')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  getApAging(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('supplierId', HashIdPipe) supplierId?: number,
  ) {
    return this.apService.getApAging(db, supplierId);
  }

  @Get('ap-payments')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findApPayments(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('supplierId', HashIdPipe) supplierId?: number,
  ) {
    return this.apService.findAllPayments(db, supplierId);
  }

  @Post('ap-payments')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createApPayment(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateApPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.apService.createPayment(db, dto, user.userId);
  }

  // ================================================================
  // ACCOUNTS RECEIVABLE
  // ================================================================

  @Get('ar-transactions')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findArTransactions(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('customerId', HashIdPipe) customerId?: number,
    @Query('status') status?: string,
  ) {
    return this.arService.findAllTransactions(db, customerId, status);
  }

  @Get('ar-transactions/aging')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  getArAging(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('customerId', HashIdPipe) customerId?: number,
  ) {
    return this.arService.getArAging(db, customerId);
  }

  // ================================================================
  // BANK
  // ================================================================

  @Get('bank-accounts')
  @RequirePermission(MODULES.BANK, ACTIONS.READ)
  findBankAccounts(@TenantDb() db: Kysely<TenantSchema>) {
    return this.bankService.findAllBankAccounts(db);
  }

  @Post('bank-accounts')
  @RequirePermission(MODULES.BANK, ACTIONS.WRITE)
  createBankAccount(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.bankService.createBankAccount(db, dto);
  }

  @Get('bank-accounts/:id/transactions')
  @RequirePermission(MODULES.BANK, ACTIONS.READ)
  findBankTransactions(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.bankService.findTransactions(db, id, dateFrom, dateTo);
  }

  @Post('bank-transactions')
  @RequirePermission(MODULES.BANK, ACTIONS.WRITE)
  createBankTransaction(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateBankTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankService.createTransaction(db, dto, user.userId);
  }

  @Get('bank-accounts/:id/reconciliations')
  @RequirePermission(MODULES.BANK, ACTIONS.READ)
  findReconciliations(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bankService.findReconciliations(db, id);
  }

  @Post('bank-reconciliations')
  @RequirePermission(MODULES.BANK, ACTIONS.WRITE)
  createReconciliation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: BankReconciliationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankService.createReconciliation(db, dto, user.userId);
  }

  @Post('bank-reconciliations/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.BANK, ACTIONS.APPROVE)
  completeReconciliation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankService.completeReconciliation(db, id, user.userId);
  }

  // ================================================================
  // TAX CODES
  // ================================================================

  @Get('tax-codes')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findTaxCodes(@TenantDb() db: Kysely<TenantSchema>) {
    return this.bankService.findAllTaxCodes(db);
  }

  @Post('tax-codes')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createTaxCode(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateTaxCodeDto,
  ) {
    return this.bankService.createTaxCode(db, dto);
  }

  // ================================================================
  // OVERHEAD RATES
  // ================================================================

  @Get('overhead-rates')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.READ)
  findOverheadRates(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('periodId', HashIdPipe) periodId?: number,
  ) {
    return this.bankService.findOverheadRates(db, periodId);
  }

  @Post('overhead-rates')
  @RequirePermission(MODULES.ACCOUNTING, ACTIONS.WRITE)
  createOverheadRate(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateOverheadRateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankService.createOverheadRate(db, dto, user.userId);
  }
}
