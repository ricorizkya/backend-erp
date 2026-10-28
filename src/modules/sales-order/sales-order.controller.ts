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

import { SalesQuotationService } from './services/sales-quotation.service';
import { SalesOrderService } from './services/sales-order.service';
import { DeliveryOrderService } from './services/delivery-order.service';
import {
  CustomerInvoiceService,
  PaymentReceiptService,
} from './services/customer-invoice.service';

import {
  CreateSalesQuotationDto,
  UpdateSalesQuotationDto,
  CreateSalesOrderDto,
  CancelSoDto,
  CreateDeliveryOrderDto,
  CreateCustomerInvoiceDto,
  CreatePaymentReceiptDto,
  PaginationDto,
} from './dto/sales-order.dto';

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class SalesOrderController {
  constructor(
    private readonly sqService: SalesQuotationService,
    private readonly soService: SalesOrderService,
    private readonly doService: DeliveryOrderService,
    private readonly invoiceService: CustomerInvoiceService,
    private readonly paymentService: PaymentReceiptService,
  ) {}

  // ================================================================
  // SALES QUOTATIONS
  // ================================================================

  @Get('sales-quotations')
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.READ)
  findAllSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.sqService.findAll(db, filter);
  }

  @Get('sales-quotations/:id')
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.READ)
  findOneSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.sqService.findOne(db, id);
  }

  @Post('sales-quotations')
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.WRITE)
  createSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateSalesQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sqService.create(db, dto, user.userId);
  }

  @Patch('sales-quotations/:id')
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.WRITE)
  updateSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateSalesQuotationDto,
  ) {
    return this.sqService.update(db, id, dto);
  }

  @Post('sales-quotations/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.WRITE)
  sendSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sqService.send(db, id, user.userId);
  }

  @Post('sales-quotations/:id/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.APPROVE)
  acceptSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.sqService.accept(db, id);
  }

  @Post('sales-quotations/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.APPROVE)
  rejectSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.sqService.reject(db, id);
  }

  @Post('sales-quotations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_QUOTATION, ACTIONS.WRITE)
  cancelSq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.sqService.cancel(db, id);
  }

  // ================================================================
  // SALES ORDERS
  // ================================================================

  @Get('sales-orders')
  @RequirePermission(MODULES.SALES_ORDER, ACTIONS.READ)
  findAllSo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.soService.findAll(db, filter);
  }

  @Get('sales-orders/:id')
  @RequirePermission(MODULES.SALES_ORDER, ACTIONS.READ)
  findOneSo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.soService.findOne(db, id);
  }

  @Post('sales-orders')
  @RequirePermission(MODULES.SALES_ORDER, ACTIONS.WRITE)
  createSo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateSalesOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.soService.create(db, dto, user.userId);
  }

  @Post('sales-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_ORDER, ACTIONS.APPROVE)
  confirmSo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.soService.confirm(db, id, user.userId);
  }

  @Post('sales-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.SALES_ORDER, ACTIONS.APPROVE)
  cancelSo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CancelSoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.soService.cancel(db, id, user.userId, dto);
  }

  // ================================================================
  // DELIVERY ORDERS
  // ================================================================

  @Get('delivery-orders')
  @RequirePermission(MODULES.DELIVERY_ORDER, ACTIONS.READ)
  findAllDo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.doService.findAll(db, filter);
  }

  @Get('delivery-orders/:id')
  @RequirePermission(MODULES.DELIVERY_ORDER, ACTIONS.READ)
  findOneDo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.doService.findOne(db, id);
  }

  @Post('delivery-orders')
  @RequirePermission(MODULES.DELIVERY_ORDER, ACTIONS.WRITE)
  createDo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateDeliveryOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.doService.create(db, dto, user.userId);
  }

  @Post('delivery-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.DELIVERY_ORDER, ACTIONS.APPROVE)
  confirmDo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.doService.confirm(db, id, user.userId);
  }

  @Post('delivery-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.DELIVERY_ORDER, ACTIONS.APPROVE)
  cancelDo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.doService.cancel(db, id, user.userId);
  }

  // ================================================================
  // CUSTOMER INVOICES
  // ================================================================

  @Get('customer-invoices')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.READ)
  findAllInvoices(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.invoiceService.findAllInvoices(db, filter);
  }

  @Get('customer-invoices/overdue')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.READ)
  findOverdueInvoices(@TenantDb() db: Kysely<TenantSchema>) {
    return this.invoiceService.findOverdue(db);
  }

  @Get('customer-invoices/:id')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.READ)
  findOneInvoice(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.invoiceService.findOneInvoice(db, id);
  }

  @Post('customer-invoices')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.WRITE)
  createInvoice(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateCustomerInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoiceService.createInvoice(db, dto, user.userId);
  }

  // ================================================================
  // PAYMENT RECEIPTS
  // ================================================================

  @Get('payment-receipts')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.READ)
  findAllPayments(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.paymentService.findAll(db, filter);
  }

  @Get('payment-receipts/:id')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.READ)
  findOnePayment(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.paymentService.findOne(db, id);
  }

  @Post('payment-receipts')
  @RequirePermission(MODULES.CUSTOMER_INVOICE, ACTIONS.WRITE)
  createPayment(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreatePaymentReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentService.create(db, dto, user.userId);
  }
}
