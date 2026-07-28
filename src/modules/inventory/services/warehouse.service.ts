import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateBranchDto,
  UpdateBranchDto,
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateWarehouseLocationDto,
} from '../dto/inventory.dto';

@Injectable()
export class WarehouseService {
  // ----------------------------------------------------------------
  // BRANCHES
  // ----------------------------------------------------------------

  async findAllBranches(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('branches')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async findOneBranch(db: Kysely<TenantSchema>, branchId: number) {
    const branch = await db
      .selectFrom('branches')
      .where('id', '=', branchId)
      .selectAll()
      .executeTakeFirst();

    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    // Sertakan warehouses di bawah branch ini
    const warehouses = await db
      .selectFrom('warehouses')
      .where('branch_id', '=', branchId)
      .selectAll()
      .orderBy('name', 'asc')
      .execute();

    return { ...branch, warehouses };
  }

  async createBranch(db: Kysely<TenantSchema>, dto: CreateBranchDto) {
    const [branch] = await db
      .insertInto('branches')
      .values({
        name: dto.name,
        address: dto.address ?? null,
        city: dto.city ?? null,
      })
      .returningAll()
      .execute();

    return branch;
  }

  async updateBranch(
    db: Kysely<TenantSchema>,
    branchId: number,
    dto: UpdateBranchDto,
  ) {
    const branch = await db
      .selectFrom('branches')
      .where('id', '=', branchId)
      .select('id')
      .executeTakeFirst();

    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    const [updated] = await db
      .updateTable('branches')
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address ?? null } : {}),
        ...(dto.city !== undefined ? { city: dto.city ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      })
      .where('id', '=', branchId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // WAREHOUSES
  // ----------------------------------------------------------------

  async findAllWarehouses(db: Kysely<TenantSchema>, branchId?: number) {
    let query = db
      .selectFrom('warehouses as w')
      .innerJoin('branches as b', 'b.id', 'w.branch_id')
      .select([
        'w.id',
        'w.code',
        'w.name',
        'w.type',
        'w.is_active',
        'w.created_at',
        'b.id as branch_id',
        'b.name as branch_name',
      ]);

    if (branchId) {
      query = query.where('w.branch_id', '=', branchId);
    }

    return query.orderBy('b.name', 'asc').orderBy('w.name', 'asc').execute();
  }

  async findOneWarehouse(db: Kysely<TenantSchema>, warehouseId: number) {
    const warehouse = await db
      .selectFrom('warehouses as w')
      .innerJoin('branches as b', 'b.id', 'w.branch_id')
      .where('w.id', '=', warehouseId)
      .select([
        'w.id',
        'w.code',
        'w.name',
        'w.type',
        'w.is_active',
        'w.created_at',
        'b.id as branch_id',
        'b.name as branch_name',
        'b.city',
      ])
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    const locations = await db
      .selectFrom('warehouse_locations')
      .where('warehouse_id', '=', warehouseId)
      .selectAll()
      .orderBy('code', 'asc')
      .execute();

    return { ...warehouse, locations };
  }

  async createWarehouse(db: Kysely<TenantSchema>, dto: CreateWarehouseDto) {
    const branch = await db
      .selectFrom('branches')
      .where('id', '=', dto.branchId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!branch) throw new NotFoundException('Cabang tidak ditemukan');

    const existing = await db
      .selectFrom('warehouses')
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Kode gudang "${dto.code}" sudah digunakan`);
    }

    const [warehouse] = await db
      .insertInto('warehouses')
      .values({
        branch_id: dto.branchId,
        name: dto.name,
        code: dto.code,
        type: dto.type,
      })
      .returningAll()
      .execute();

    return warehouse;
  }

  async updateWarehouse(
    db: Kysely<TenantSchema>,
    warehouseId: number,
    dto: UpdateWarehouseDto,
  ) {
    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', warehouseId)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    const [updated] = await db
      .updateTable('warehouses')
      .set({
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      })
      .where('id', '=', warehouseId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // WAREHOUSE LOCATIONS
  // ----------------------------------------------------------------

  async findLocations(db: Kysely<TenantSchema>, warehouseId: number) {
    return db
      .selectFrom('warehouse_locations')
      .where('warehouse_id', '=', warehouseId)
      .where('is_active', '=', true)
      .selectAll()
      .orderBy('code', 'asc')
      .execute();
  }

  async createLocation(
    db: Kysely<TenantSchema>,
    dto: CreateWarehouseLocationDto,
  ) {
    const warehouse = await db
      .selectFrom('warehouses')
      .where('id', '=', dto.warehouseId)
      .where('is_active', '=', true)
      .select('id')
      .executeTakeFirst();

    if (!warehouse) throw new NotFoundException('Gudang tidak ditemukan');

    const existing = await db
      .selectFrom('warehouse_locations')
      .where('warehouse_id', '=', dto.warehouseId)
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Kode lokasi "${dto.code}" sudah ada di gudang ini`,
      );
    }

    const [location] = await db
      .insertInto('warehouse_locations')
      .values({
        warehouse_id: dto.warehouseId,
        code: dto.code,
        name: dto.name ?? null,
      })
      .returningAll()
      .execute();

    return location;
  }

  async deleteLocation(db: Kysely<TenantSchema>, locationId: number) {
    const location = await db
      .selectFrom('warehouse_locations')
      .where('id', '=', locationId)
      .select('id')
      .executeTakeFirst();

    if (!location) throw new NotFoundException('Lokasi tidak ditemukan');

    // Soft delete — cukup set is_active = false
    // karena lokasi mungkin masih di-reference di movement history
    const [updated] = await db
      .updateTable('warehouse_locations')
      .set({ is_active: false })
      .where('id', '=', locationId)
      .returningAll()
      .execute();

    return { message: 'Lokasi berhasil dinonaktifkan' };
  }
}
