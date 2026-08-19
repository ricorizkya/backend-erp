import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { QualityControlController } from './quality-control.controller';
import { QcMasterService } from './services/qc-master.service';
import { QcInspectionService } from './services/qc-inspection.service';

@Module({
  imports: [CommonModule],
  controllers: [QualityControlController],
  providers: [QcMasterService, QcInspectionService],
  exports: [QcMasterService, QcInspectionService],
})
export class QualityControlModule {}
