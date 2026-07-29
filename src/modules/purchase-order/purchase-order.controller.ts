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

import { PurchaseRequestService } from './services/purchase-request.service';
import { RfqService } from './services/rfq.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { VendorInvoiceService } from './services/vendor-invoice.service';

import {
  CreatePurchaseRequestDto,
  ApprovePrDto,
  RejectPrDto,
  CreateRfqDto,
  SubmitRfqQuoteDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  CancelPoDto,
  CreateGoodsReceiptDto,
  CreateVendorInvoiceDto,
  PaginationDto,
} from './dto/purchase-order.dto';

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class PurchaseOrderController {
  constructor(
    private readonly prService: PurchaseRequestService,
    private readonly rfqService: RfqService,
    private readonly poService: PurchaseOrderService,
    private readonly grService: GoodsReceiptService,
    private readonly viService: VendorInvoiceService,
  ) {}

  // ================================================================
  // PURCHASE REQUESTS
  // ================================================================

  @Get('purchase-requests')
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.READ)
  findAllPr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.prService.findAll(db, filter);
  }

  @Get('purchase-requests/:id')
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.READ)
  findOnePr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.prService.findOne(db, id);
  }

  @Post('purchase-requests')
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.WRITE)
  createPr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prService.create(db, dto, user.userId);
  }

  @Post('purchase-requests/:id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.WRITE)
  submitPr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prService.submit(db, id, user.userId);
  }

  @Post('purchase-requests/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.APPROVE)
  approvePr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: ApprovePrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prService.approve(db, id, user.userId, dto);
  }

  @Post('purchase-requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_REQUEST, ACTIONS.APPROVE)
  rejectPr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: RejectPrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.prService.reject(db, id, user.userId, dto);
  }

  // ================================================================
  // RFQ
  // ================================================================

  @Get('rfqs')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.READ)
  findAllRfq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.rfqService.findAll(db, filter);
  }

  @Get('rfqs/:id')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.READ)
  findOneRfq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.rfqService.findOne(db, id);
  }

  @Post('rfqs')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.WRITE)
  createRfq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateRfqDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rfqService.create(db, dto, user.userId);
  }

  @Post('rfqs/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.WRITE)
  sendRfq(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.rfqService.send(db, id);
  }

  @Post('rfqs/:id/quotes')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.WRITE)
  submitRfqQuote(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: SubmitRfqQuoteDto,
  ) {
    return this.rfqService.submitQuote(db, id, dto);
  }

  @Post('rfqs/:id/quotes/:quoteId/select')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.APPROVE)
  selectRfqQuote(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Param('quoteId', HashIdPipe) quoteId: number,
  ) {
    return this.rfqService.selectQuote(db, id, quoteId);
  }

  // ================================================================
  // PURCHASE ORDERS
  // ================================================================

  @Get('purchase-orders')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.READ)
  findAllPo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.poService.findAll(db, filter);
  }

  @Get('purchase-orders/:id')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.READ)
  findOnePo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.poService.findOne(db, id);
  }

  @Post('purchase-orders')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.WRITE)
  createPo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.poService.create(db, dto, user.userId);
  }

  @Patch('purchase-orders/:id')
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.WRITE)
  updatePo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.poService.update(db, id, dto);
  }

  @Post('purchase-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.APPROVE)
  confirmPo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.poService.confirm(db, id, user.userId);
  }

  @Post('purchase-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PURCHASE_ORDER, ACTIONS.APPROVE)
  cancelPo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CancelPoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.poService.cancel(db, id, user.userId, dto);
  }

  // ================================================================
  // GOODS RECEIPTS
  // ================================================================

  @Get('goods-receipts')
  @RequirePermission(MODULES.GOODS_RECEIPT, ACTIONS.READ)
  findAllGr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.grService.findAll(db, filter);
  }

  @Get('goods-receipts/:id')
  @RequirePermission(MODULES.GOODS_RECEIPT, ACTIONS.READ)
  findOneGr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.grService.findOne(db, id);
  }

  @Post('goods-receipts')
  @RequirePermission(MODULES.GOODS_RECEIPT, ACTIONS.WRITE)
  createGr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grService.create(db, dto, user.userId);
  }

  @Post('goods-receipts/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.GOODS_RECEIPT, ACTIONS.APPROVE)
  confirmGr(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grService.confirm(db, id, user.userId);
  }

  // ================================================================
  // VENDOR INVOICES
  // ================================================================

  @Get('vendor-invoices')
  @RequirePermission(MODULES.VENDOR_INVOICE, ACTIONS.READ)
  findAllVi(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: PaginationDto,
  ) {
    return this.viService.findAll(db, filter);
  }

  @Get('vendor-invoices/overdue')
  @RequirePermission(MODULES.VENDOR_INVOICE, ACTIONS.READ)
  findOverdueVi(@TenantDb() db: Kysely<TenantSchema>) {
    return this.viService.findOverdue(db);
  }

  @Get('vendor-invoices/:id')
  @RequirePermission(MODULES.VENDOR_INVOICE, ACTIONS.READ)
  findOneVi(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.viService.findOne(db, id);
  }

  @Post('vendor-invoices')
  @RequirePermission(MODULES.VENDOR_INVOICE, ACTIONS.WRITE)
  createVi(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateVendorInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.viService.create(db, dto, user.userId);
  }

  @Post('vendor-invoices/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.VENDOR_INVOICE, ACTIONS.APPROVE)
  cancelVi(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.viService.cancel(db, id);
  }
}
