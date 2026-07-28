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

import { ProductService } from './service/product.service';
import { ProductCategoryService } from './service/product-category.service';
import { AttributeService } from './service/attribute.service';
import { UomService } from './service/uom.service';

import {
  CreateProductDto,
  UpdateProductDto,
  ProductFilterDto,
  CreateVariantDto,
  UpdateVariantDto,
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CreateAttributeDto,
  CreateAttributeValueDto,
  CreateUomDto,
  UpdateUomDto,
  CreateUomConversionDto,
  CreateBatchDto,
} from './dto/product.dto';
import { BatchService } from './service/batch.service';
// ================================================================
// GUARD SHORTHAND
// Semua endpoint di module ini butuh JWT + Permission check
// ================================================================
const Guards = () => UseGuards(JwtAuthGuard, PermissionGuard);

@Controller()
@Guards()
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly attributeService: AttributeService,
    private readonly uomService: UomService,
    private readonly batchService: BatchService,
  ) {}

  // ================================================================
  // UOM
  // ================================================================

  @Get('uom')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findAllUom(@TenantDb() db: Kysely<TenantSchema>) {
    return this.uomService.findAll(db);
  }

  @Post('uom')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createUom(@TenantDb() db: Kysely<TenantSchema>, @Body() dto: CreateUomDto) {
    return this.uomService.create(db, dto);
  }

  @Get('uom/:id')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findOneUom(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.uomService.findOne(db, id);
  }

  @Patch('uom/:id')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  updateUom(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateUomDto,
  ) {
    return this.uomService.update(db, id, dto);
  }

  @Delete('uom/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.DELETE)
  deleteUom(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.uomService.delete(db, id);
  }

  @Get('uom/conversions')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findAllConversions(@TenantDb() db: Kysely<TenantSchema>) {
    return this.uomService.findAllConversions(db);
  }

  @Post('uom/conversions')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createConversion(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateUomConversionDto,
  ) {
    return this.uomService.createConversion(db, dto);
  }

  // ================================================================
  // PRODUCT CATEGORIES
  // ================================================================

  @Get('product-categories')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findAllCategories(@TenantDb() db: Kysely<TenantSchema>) {
    return this.productCategoryService.findAll(db);
  }

  @Post('product-categories')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createCategory(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateProductCategoryDto,
  ) {
    return this.productCategoryService.create(db, dto);
  }

  @Patch('product-categories/:id')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  updateCategory(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.productCategoryService.update(db, id, dto);
  }

  @Delete('product-categories/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.DELETE)
  deleteCategory(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.productCategoryService.delete(db, id);
  }

  // ================================================================
  // ATTRIBUTES
  // ================================================================

  @Get('attributes')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findAllAttributes(@TenantDb() db: Kysely<TenantSchema>) {
    return this.attributeService.findAll(db);
  }

  @Post('attributes')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createAttribute(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.attributeService.create(db, dto);
  }

  @Post('attributes/:id/values')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  addAttributeValue(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.attributeService.addValue(db, id, dto);
  }

  @Delete('attributes/values/:valueId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.DELETE)
  deleteAttributeValue(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('valueId', HashIdPipe) valueId: number,
  ) {
    return this.attributeService.deleteValue(db, valueId);
  }

  // ================================================================
  // PRODUCTS
  // ================================================================

  @Get('products')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findAllProducts(
    @TenantDb() db: Kysely<TenantSchema>,
    @Query() filter: ProductFilterDto,
  ) {
    return this.productService.findAll(db, filter);
  }

  @Get('products/:id')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findOneProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.productService.findOne(db, id);
  }

  @Post('products')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.productService.create(db, dto, user.userId);
  }

  @Patch('products/:id')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  updateProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(db, id, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.DELETE)
  deleteProduct(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.productService.softDelete(db, id);
  }

  // ================================================================
  // VARIANTS
  // ================================================================

  @Get('products/:id/variants')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.READ)
  findVariants(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
  ) {
    return this.productService.findVariants(db, id);
  }

  @Post('products/:id/variants')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  createVariant(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('id', HashIdPipe) id: number,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productService.createVariant(db, id, dto);
  }

  @Patch('products/variants/:variantId')
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.WRITE)
  updateVariant(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('variantId', HashIdPipe) variantId: number,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productService.updateVariant(db, variantId, dto);
  }

  @Delete('products/variants/:variantId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MODULES.MASTER_DATA, ACTIONS.DELETE)
  deleteVariant(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('variantId', HashIdPipe) variantId: number,
  ) {
    return this.productService.softDeleteVariant(db, variantId);
  }

  // ================================================================
  // BATCHES
  // ================================================================

  @Get('products/variants/:variantId/batches')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.READ)
  findBatches(
    @TenantDb() db: Kysely<TenantSchema>,
    @Param('variantId', HashIdPipe) variantId: number,
  ) {
    return this.batchService.findByVariant(db, variantId);
  }

  @Post('batches')
  @RequirePermission(MODULES.INVENTORY, ACTIONS.WRITE)
  createBatch(
    @TenantDb() db: Kysely<TenantSchema>,
    @Body() dto: CreateBatchDto,
  ) {
    return this.batchService.create(db, dto);
  }
}
