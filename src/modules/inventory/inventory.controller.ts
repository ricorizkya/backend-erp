import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
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

import { WarehouseService } from './services/warehouse.service';
import { InventoryMovementService } from './services/inventory-movement.service';
import { StockQueryService } from './services/stok-query.service';
import { StockOpnameService } from './services/stock-opname.service';

import {
  CreateBranchDto,
  UpdateBranchDto,
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateWarehouseLocationDto,
  CreateInventoryMovementDto,
  MovementFilterDto,
  StockQueryDto,
  StockHistoryDto,
  CreateStockOpnameDto,
  CompleteOpnameDto,
} from './dto/inventory.dto';
import { IsString, IsNotEmpty } from 'class-validator';

class CancelMovementDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class InventoryController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly inventoryMovementService: InventoryMovementService,
    private readonly stockQueryService: StockQueryService,
    private readonly stockOpnameService: StockOpnameService,
  ) {}

  // ================================================================
  // BRANCHES
  // ================================================================

  @Get('branches')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findAllBranches(@TenantDb() db: Kysely<TenantSchema>) {
    return this.warehouseService.findAllBranches(db);
  }

  @Get('branches/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findOneBranch(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.warehouseService.findOneBranch(db, id);
  }

  @Post('branches')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createBranch(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateBranchDto,
  ) {
    return this.warehouseService.createBranch(db, dto);
  }

  @Patch('branches/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  updateBranch(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.warehouseService.updateBranch(db, id, dto);
  }

  // ================================================================
  // WAREHOUSES
  // ================================================================

  @Get('warehouses')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findAllWarehouses(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('branchId') branchId?: number,
  ) {
    return this.warehouseService.findAllWarehouses(db, branchId);
  }

  @Get('warehouses/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findOneWarehouse(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.warehouseService.findOneWarehouse(db, id);
  }

  @Post('warehouses')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createWarehouse(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.warehouseService.createWarehouse(db, dto);
  }

  @Patch('warehouses/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  updateWarehouse(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.updateWarehouse(db, id, dto);
  }

  // ================================================================
  // WAREHOUSE LOCATIONS
  // ================================================================

  @Get('warehouses/:id/locations')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findLocations(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.warehouseService.findLocations(db, id);
  }

  @Post('warehouse-locations')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createLocation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateWarehouseLocationDto,
  ) {
    return this.warehouseService.createLocation(db, dto);
  }

  @Delete('warehouse-locations/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.INVENTORY, ACTIONS.DELETE)
  deleteLocation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.warehouseService.deleteLocation(db, id);
  }

  // ================================================================
  // INVENTORY MOVEMENTS
  // ================================================================

  @Get('inventory-movements')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findAllMovements(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: MovementFilterDto,
  ) {
    return this.inventoryMovementService.findAll(db, filter);
  }

  @Get('inventory-movements/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findOneMovement(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.inventoryMovementService.findOne(db, id);
  }

  @Post('inventory-movements')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createMovement(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateInventoryMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryMovementService.create(db, dto, user.userId);
  }

  @Post('inventory-movements/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.INVENTORY, ACTIONS.APPROVE)
  confirmMovement(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryMovementService.confirm(db, id, user.userId);
  }

  @Post('inventory-movements/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.INVENTORY, ACTIONS.APPROVE)
  cancelMovement(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CancelMovementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryMovementService.cancel(
      db,
      id,
      user.userId,
      dto.reason,
    );
  }

  // ================================================================
  // STOCK QUERIES
  // ================================================================

  @Get('stock')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  getStockOnHand(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() query: StockQueryDto,
  ) {
    return this.stockQueryService.getStockOnHand(db, query);
  }

  @Get('stock/variants/:variantId')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  getStockByVariant(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('variantId', HashIdPipe) variantId: number,
  ) {
    return this.stockQueryService.getStockByVariant(db, variantId);
  }

  @Get('stock/history')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  getStockHistory(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() query: StockHistoryDto,
  ) {
    return this.stockQueryService.getStockHistory(db, query);
  }

  @Get('stock/locations/:warehouseId')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  getStockByLocation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('warehouseId', HashIdPipe) warehouseId: number,
  ) {
    return this.stockQueryService.getStockByLocation(db, warehouseId);
  }

  @Get('stock/reorder-alerts')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  getReorderAlerts(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('warehouseId') warehouseId?: number,
  ) {
    return this.stockQueryService.getReorderAlerts(db, warehouseId);
  }

  // ================================================================
  // STOCK OPNAME
  // ================================================================

  @Get('stock-opnames')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findAllOpnames(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query('warehouseId') warehouseId?: number,
  ) {
    return this.stockOpnameService.findAll(db, warehouseId);
  }

  @Get('stock-opnames/:id')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findOneOpname(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.stockOpnameService.findOne(db, id);
  }

  @Post('stock-opnames')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createOpname(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateStockOpnameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockOpnameService.create(db, dto, user.userId);
  }

  @Post('stock-opnames/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.INVENTORY, ACTIONS.APPROVE)
  completeOpname(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CompleteOpnameDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockOpnameService.complete(db, id, dto, user.userId);
  }

  @Post('stock-opnames/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.INVENTORY, ACTIONS.APPROVE)
  cancelOpname(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockOpnameService.cancel(db, id, user.userId);
  }
}
