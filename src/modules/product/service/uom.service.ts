import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateUomDto,
  CreateUomConversionDto,
  UpdateUomDto,
} from '../dto/product.dto';

@Injectable()
export class UomService {
  async findAll(db: Kysely<TenantSchema>) {
    const uoms = await db
      .selectFrom('uom')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();

    return uoms;
  }

  async create(db: Kysely<TenantSchema>, dto: CreateUomDto) {
    const existing = await db
      .selectFrom('uom')
      .where('symbol', '=', dto.symbol)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Satuan dengan simbol "${dto.symbol}" sudah ada`,
      );
    }

    const [uom] = await db
      .insertInto('uom')
      .values({ name: dto.name, symbol: dto.symbol })
      .returningAll()
      .execute();

    return uom;
  }

  async findOne(db: Kysely<TenantSchema>, id: number) {
    const uom = await db
      .selectFrom('uom')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();

    if (!uom) {
      throw new NotFoundException('Satuan (UoM) tidak ditemukan');
    }

    return uom;
  }

  async update(db: Kysely<TenantSchema>, id: number, dto: UpdateUomDto) {
    // Pastikan UoM ada
    await this.findOne(db, id);

    if (dto.symbol) {
      const existing = await db
        .selectFrom('uom')
        .where('symbol', '=', dto.symbol)
        .where('id', '!=', id)
        .select('id')
        .executeTakeFirst();

      if (existing) {
        throw new ConflictException(
          `Satuan dengan simbol "${dto.symbol}" sudah ada`,
        );
      }
    }

    const [uom] = await db
      .updateTable('uom')
      .set({
        ...(dto.name && { name: dto.name }),
        ...(dto.symbol && { symbol: dto.symbol }),
      })
      .where('id', '=', id)
      .returningAll()
      .execute();

    return uom;
  }

  async delete(db: Kysely<TenantSchema>, id: number) {
    // Pastikan UoM ada
    await this.findOne(db, id);

    // TODO: Pastikan tidak dipakai di tabel products dll sebelum dihapus

    await db.deleteFrom('uom').where('id', '=', id).execute();

    return { message: 'Satuan (UoM) berhasil dihapus' };
  }

  async createConversion(
    db: Kysely<TenantSchema>,
    dto: CreateUomConversionDto,
  ) {
    // Pastikan kedua UoM ada
    const [from, to] = await Promise.all([
      db
        .selectFrom('uom')
        .where('id', '=', dto.fromUomId)
        .select('id')
        .executeTakeFirst(),
      db
        .selectFrom('uom')
        .where('id', '=', dto.toUomId)
        .select('id')
        .executeTakeFirst(),
    ]);

    if (!from) throw new NotFoundException(`UoM asal tidak ditemukan`);
    if (!to) throw new NotFoundException(`UoM tujuan tidak ditemukan`);

    const existing = await db
      .selectFrom('uom_conversions')
      .where('from_uom_id', '=', dto.fromUomId)
      .where('to_uom_id', '=', dto.toUomId)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException('Konversi UoM ini sudah ada');
    }

    const [conversion] = await db
      .insertInto('uom_conversions')
      .values({
        from_uom_id: dto.fromUomId,
        to_uom_id: dto.toUomId,
        factor: dto.factor,
      })
      .returningAll()
      .execute();

    return conversion;
  }

  async findAllConversions(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('uom_conversions as uc')
      .innerJoin('uom as from_uom', 'from_uom.id', 'uc.from_uom_id')
      .innerJoin('uom as to_uom', 'to_uom.id', 'uc.to_uom_id')
      .select([
        'uc.id',
        'uc.factor',
        'from_uom.name as from_uom_name',
        'from_uom.symbol as from_uom_symbol',
        'to_uom.name as to_uom_name',
        'to_uom.symbol as to_uom_symbol',
      ])
      .execute();
  }
}
