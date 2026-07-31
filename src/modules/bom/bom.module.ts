import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BomController } from './bom.controller';
import { BomService } from './services/bom.service';

@Module({
  imports: [CommonModule],
  controllers: [BomController],
  providers: [BomService],
  exports: [BomService], // dipakai ProductionModule
})
export class BomModule {}
