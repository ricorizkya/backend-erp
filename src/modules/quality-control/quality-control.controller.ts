import {
  Controller,
  Get,
  Post,
  Delete,
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
import { QcMasterService } from './services/qc-master.service';
import { QcInspectionService } from './services/qc-inspection.service';
import {
  CreateQcParameterDto,
  CreateQcChecklistDto,
  CreateDefectTypeDto,
  CreateQcInspectionDto,
  CompleteInspectionDto,
  QcInspectionFilterDto,
} from './dto/qc.dto';

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class QualityControlController {
  constructor(
    private readonly masterService: QcMasterService,
    private readonly inspectionService: QcInspectionService,
  ) {}

  // ================================================================
  // QC PARAMETERS
  // ================================================================

  @Get('qc-parameters')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findAllParameters(@TenantDb() db: Kysely<TenantSchema>) {
    return this.masterService.findAllParameters(db);
  }

  @Post('qc-parameters')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.WRITE)
  createParameter(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateQcParameterDto,
  ) {
    return this.masterService.createParameter(db, dto);
  }

  @Delete('qc-parameters/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.DELETE)
  deactivateParameter(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.masterService.deactivateParameter(db, id);
  }

  // ================================================================
  // QC CHECKLISTS
  // ================================================================

  @Get('qc-checklists')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findAllChecklists(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('inspectionType') inspectionType?: string,
  ) {
    return this.masterService.findAllChecklists(db, inspectionType);
  }

  @Get('qc-checklists/:id')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findOneChecklist(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.masterService.findOneChecklist(db, id);
  }

  @Post('qc-checklists')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.WRITE)
  createChecklist(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateQcChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.masterService.createChecklist(db, dto, user.userId);
  }

  @Delete('qc-checklists/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.DELETE)
  deactivateChecklist(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.masterService.deactivateChecklist(db, id);
  }

  // ================================================================
  // DEFECT TYPES
  // ================================================================

  @Get('qc-defect-types')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findAllDefectTypes(@TenantDb() db: Kysely<TenantSchema>) {
    return this.masterService.findAllDefectTypes(db);
  }

  @Post('qc-defect-types')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.WRITE)
  createDefectType(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateDefectTypeDto,
  ) {
    return this.masterService.createDefectType(db, dto);
  }

  // ================================================================
  // QC INSPECTIONS
  // ================================================================

  @Get('qc-inspections')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findAllInspections(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: QcInspectionFilterDto,
  ) {
    return this.inspectionService.findAll(db, filter);
  }

  @Get('qc-inspections/defect-summary')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  getDefectSummary(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('inspectionType') inspectionType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.inspectionService.getDefectSummary(
      db,
      inspectionType,
      dateFrom,
      dateTo,
    );
  }

  @Get('qc-inspections/:id')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.READ)
  findOneInspection(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.inspectionService.findOne(db, id);
  }

  @Post('qc-inspections')
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.WRITE)
  createInspection(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateQcInspectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inspectionService.create(db, dto, user.userId);
  }

  @Post('qc-inspections/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.APPROVE)
  completeInspection(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CompleteInspectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inspectionService.complete(db, id, dto, user.userId);
  }

  @Post('qc-inspections/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.QUALITY_CONTROL, ACTIONS.WRITE)
  cancelInspection(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.inspectionService.cancel(db, id);
  }
}
