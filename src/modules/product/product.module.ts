import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './service/product.service';
import { ProductCategoryService } from './service/product-category.service';
import { AttributeService } from './service/attribute.service';
import { UomService } from './service/uom.service';
import { BatchService } from './service/batch.service';

@Module({
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductCategoryService,
    AttributeService,
    UomService,
    BatchService,
  ],
  // Export services agar bisa dipakai modul lain
  // (PurchaseOrderModule, SalesOrderModule, BOMModule, dll)
  exports: [ProductService, UomService, BatchService],
})
export class ProductModule {}
