import {
  Controller,
  Get,
  Post,
  Patch,
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
import { WorkOrderService } from './services/work-order.service';
import { MrpDemandService } from './services/mrp-demand.service';
import {
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  ConsumeMaterialsDto,
  CreateProductionResultDto,
  WorkOrderFilterDto,
  CreateMrpDemandDto,
  MrpDemandFilterDto,
} from './dto/production.dto';
import { IsString, IsNotEmpty } from 'class-validator';

class CancelWoDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class ProductionController {
  constructor(
    private readonly woService: WorkOrderService,
    private readonly mrpDemandService: MrpDemandService,
  ) {}

  // ================================================================
  // MRP DEMANDS
  // ================================================================

  @Get('mrp-demands')
  @RequirePermission(MODULES.MRP, ACTIONS.READ)
  findAllDemands(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: MrpDemandFilterDto,
  ) {
    return this.mrpDemandService.findAll(db, filter);
  }

  @Post('mrp-demands')
  @RequirePermission(MODULES.MRP, ACTIONS.WRITE)
  createDemand(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateMrpDemandDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mrpDemandService.create(db, dto, user.userId);
  }

  @Post('mrp-demands/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MRP, ACTIONS.WRITE)
  cancelDemand(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.mrpDemandService.cancel(db, id);
  }

  // ================================================================
  // WORK ORDERS
  // ================================================================

  @Get('work-orders')
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.READ)
  findAllWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: WorkOrderFilterDto,
  ) {
    return this.woService.findAll(db, filter);
  }

  @Get('work-orders/:id')
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.READ)
  findOneWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.woService.findOne(db, id);
  }

  @Post('work-orders')
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  createWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.create(db, dto, user.userId);
  }

  @Patch('work-orders/:id')
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  updateWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateWorkOrderDto,
  ) {
    return this.woService.update(db, id, dto);
  }

  @Post('work-orders/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.APPROVE)
  confirmWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.confirm(db, id, user.userId);
  }

  @Post('work-orders/:id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  startWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.woService.startProduction(db, id);
  }

  @Post('work-orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.APPROVE)
  cancelWo(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CancelWoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.cancel(db, id, user.userId, dto.reason);
  }

  // ================================================================
  // MATERIAL CONSUMPTION
  // ================================================================

  @Post('work-orders/:id/consume-materials')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  consumeMaterials(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: ConsumeMaterialsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.consumeMaterials(db, id, dto, user.userId);
  }

  // ================================================================
  // PRODUCTION RESULTS
  // ================================================================

  @Post('work-orders/:id/production-results')
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  recordResult(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CreateProductionResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.recordResult(db, id, dto, user.userId);
  }

  // ================================================================
  // OPERATIONS
  // ================================================================

  @Post('work-order-operations/:id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  startOperation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.woService.startOperation(db, id, user.userId);
  }

  @Post('work-order-operations/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.PRODUCTION, ACTIONS.WRITE)
  completeOperation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.woService.completeOperation(db, id);
  }
}
