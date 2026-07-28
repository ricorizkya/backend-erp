import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { WarehouseService } from './services/warehouse.service';
import { InventoryMovementService } from './services/inventory-movement.service';
import { StockOpnameService } from './services/stock-opname.service';
import { StockQueryService } from './services/stok-query.service';

@Module({
  controllers: [InventoryController],
  providers: [
    WarehouseService,
    InventoryMovementService,
    StockQueryService,
    StockOpnameService,
  ],
  exports: [WarehouseService, InventoryMovementService, StockQueryService],
})
export class InventoryModule {}
