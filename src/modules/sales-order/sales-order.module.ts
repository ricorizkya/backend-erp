import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { ProductionModule } from '../production/production.module';
import { SalesOrderController } from './sales-order.controller';
import { SalesQuotationService } from './services/sales-quotation.service';
import { SalesOrderService } from './services/sales-order.service';
import { DeliveryOrderService } from './services/delivery-order.service';
import {
  CustomerInvoiceService,
  PaymentReceiptService,
} from './services/customer-invoice.service';

@Module({
  imports: [CommonModule, ProductionModule],
  controllers: [SalesOrderController],
  providers: [
    SalesQuotationService,
    SalesOrderService,
    DeliveryOrderService,
    CustomerInvoiceService,
    PaymentReceiptService,
  ],
  exports: [SalesOrderService, CustomerInvoiceService],
})
export class SalesOrderModule {}
