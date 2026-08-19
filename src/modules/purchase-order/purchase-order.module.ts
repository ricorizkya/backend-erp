import { Module } from '@nestjs/common';
import { PurchaseOrderController } from './purchase-order.controller';
import { CommonModule } from '../../common/common.module';
import { PurchaseRequestService } from './services/purchase-request.service';
import { RfqService } from './services/rfq.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { VendorInvoiceService } from './services/vendor-invoice.service';

import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [CommonModule, AccountingModule],
  controllers: [PurchaseOrderController],
  providers: [
    PurchaseRequestService,
    RfqService,
    PurchaseOrderService,
    GoodsReceiptService,
    VendorInvoiceService,
  ],
  exports: [
    PurchaseOrderService,
    VendorInvoiceService,
  ],
})
export class PurchaseOrderModule {}
