import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from '../../common/common.module';
import { ProductionController } from './production.controller';
import { WorkOrderService } from './services/work-order.service';
import { MrpDemandService } from './services/mrp-demand.service';
import { MrpRunService } from './services/mrp-run.service';
import { PlannedOrderService } from './services/planned-order.service';
import { MrpReconciliationService } from './services/mrp-reconciliation.service';
import { BomModule } from '../bom/bom.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';

@Module({
  imports: [
    CommonModule,
    BomModule,
    AccountingModule,
    PurchaseOrderModule,
    BullModule.registerQueue({
      name: 'mrp-calculation',
    }),
  ],
  controllers: [ProductionController],
  providers: [
    WorkOrderService,
    MrpDemandService,
    MrpRunService,
    PlannedOrderService,
    MrpReconciliationService,
  ],
  exports: [
    WorkOrderService,
    MrpDemandService,
    MrpRunService,
    PlannedOrderService,
  ],
})
export class ProductionModule {}
