import { Module } from '@nestjs/common';
import { PurchaseOrderController } from './purchase-order.controller';
import { DocumentNumberService } from './services/document-number.service';
import { PurchaseRequestService } from './services/purchase-request.service';
import { RfqService } from './services/rfq.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { VendorInvoiceService } from './services/vendor-invoice.service';

@Module({
  controllers: [PurchaseOrderController],
  providers: [
    DocumentNumberService,
    PurchaseRequestService,
    RfqService,
    PurchaseOrderService,
    GoodsReceiptService,
    VendorInvoiceService,
  ],
  exports: [
    DocumentNumberService,
    PurchaseOrderService,
    VendorInvoiceService,
  ],
})
export class PurchaseOrderModule {}
