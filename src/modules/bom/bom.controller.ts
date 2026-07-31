import {
  Controller,
  Get,
  Post,
  Patch,
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
import { BomService } from './services/bom.service';
import {
  CreateBomHeaderDto,
  UpdateBomHeaderDto,
  CreateBomVersionDto,
  UpdateBomVersionDto,
  CreateBomItemDto,
  UpdateBomItemDto,
  CreateBomOperationDto,
  UpdateBomOperationDto,
  CreateByProductDto,
  BomFilterDto,
} from './dto/bom.dto';

const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class BomController {
  constructor(private readonly bomService: BomService) {}

  // ================================================================
  // BOM HEADERS
  // ================================================================

  @Get('bom')
  @RequirePermission(MODULES.BOM, ACTIONS.READ)
  findAll(@TenantDb() db: Kysely<TenantSchema>, @Query() filter: BomFilterDto) {
    return this.bomService.findAllHeaders(db, filter);
  }

  @Get('bom/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.READ)
  findOne(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bomService.findOneHeader(db, id);
  }

  @Post('bom')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  create(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateBomHeaderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.createHeader(db, dto, user.userId);
  }

  @Patch('bom/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  update(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateBomHeaderDto,
  ) {
    return this.bomService.updateHeader(db, id, dto);
  }

  // ================================================================
  // BOM VERSIONS
  // ================================================================

  @Get('bom-versions/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.READ)
  findVersion(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bomService.findOneVersion(db, id);
  }

  @Post('bom/:headerId/versions')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  createVersion(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('headerId', HashIdPipe) headerId: number,
    @Body() dto: CreateBomVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.createVersion(db, headerId, dto, user.userId);
  }

  @Patch('bom-versions/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  updateVersion(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateBomVersionDto,
  ) {
    return this.bomService.updateVersion(db, id, dto);
  }

  @Post('bom-versions/:id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.BOM, ACTIONS.APPROVE)
  activateVersion(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bomService.activateVersion(db, id, user.userId);
  }

  // ================================================================
  // BOM ITEMS
  // ================================================================

  @Post('bom-versions/:versionId/items')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  addItem(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('versionId', HashIdPipe) versionId: number,
    @Body() dto: CreateBomItemDto,
  ) {
    return this.bomService.addItem(db, versionId, dto);
  }

  @Patch('bom-items/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  updateItem(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateBomItemDto,
  ) {
    return this.bomService.updateItem(db, id, dto);
  }

  @Delete('bom-items/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.BOM, ACTIONS.DELETE)
  deleteItem(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bomService.deleteItem(db, id);
  }

  // ================================================================
  // BOM OPERATIONS
  // ================================================================

  @Post('bom-versions/:versionId/operations')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  addOperation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('versionId', HashIdPipe) versionId: number,
    @Body() dto: CreateBomOperationDto,
  ) {
    return this.bomService.addOperation(db, versionId, dto);
  }

  @Patch('bom-operations/:id')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  updateOperation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateBomOperationDto,
  ) {
    return this.bomService.updateOperation(db, id, dto);
  }

  @Delete('bom-operations/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.BOM, ACTIONS.DELETE)
  deleteOperation(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bomService.deleteOperation(db, id);
  }

  // ================================================================
  // BY-PRODUCTS
  // ================================================================

  @Post('bom-versions/:versionId/by-products')
  @RequirePermission(MODULES.BOM, ACTIONS.WRITE)
  addByProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('versionId', HashIdPipe) versionId: number,
    @Body() dto: CreateByProductDto,
  ) {
    return this.bomService.addByProduct(db, versionId, dto);
  }

  @Delete('bom-by-products/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.BOM, ACTIONS.DELETE)
  deleteByProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.bomService.deleteByProduct(db, id);
  }

  // ================================================================
  // BOM EXPLOSION
  // ================================================================

  @Get('bom-versions/:id/explode')
  @RequirePermission(MODULES.BOM, ACTIONS.READ)
  explode(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Query('quantity') qtyStr?: string,
  ) {
    const qty = qtyStr ? parseFloat(qtyStr) : 1;
    return this.bomService.explodeBom(db, id, qty);
  }
}
