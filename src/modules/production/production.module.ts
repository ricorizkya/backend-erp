import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { ProductionController } from './production.controller';
import { WorkOrderService } from './services/work-order.service';
import { MrpDemandService } from './services/mrp-demand.service';
import { BomModule } from '../bom/bom.module';

@Module({
  imports: [CommonModule, BomModule], // BomService dipakai oleh WorkOrderService
  controllers: [ProductionController],
  providers: [WorkOrderService, MrpDemandService],
  exports: [WorkOrderService, MrpDemandService],
})
export class ProductionModule {}
