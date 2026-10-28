import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateAccountDto,
  UpdateAccountDto,
  AccountFilterDto,
} from '../dto/accounting.dto';

@Injectable()
export class AccountService {
  async findAll(db: Kysely<TenantSchema>, filter: AccountFilterDto) {
    let query = db
      .selectFrom('accounts as a')
      .leftJoin('accounts as parent', 'parent.id', 'a.parent_id')
      .select([
        'a.id',
        'a.code',
        'a.name',
        'a.account_type',
        'a.account_group',
        'a.is_header',
        'a.system_account',
        'a.level',
        'a.is_active',
        'a.notes',
        'a.parent_id',
        'parent.code as parent_code',
        'parent.name as parent_name',
      ]);

    if (filter.accountType) {
      query = query.where('a.account_type', '=', filter.accountType as any);
    }
    if (filter.isHeader !== undefined) {
      query = query.where('a.is_header', '=', filter.isHeader);
    }
    if (filter.isActive !== undefined) {
      query = query.where('a.is_active', '=', filter.isActive);
    }
    if (filter.search) {
      query = query.where((eb) =>
        eb.or([
          eb('a.code', 'ilike', `%${filter.search}%`),
          eb('a.name', 'ilike', `%${filter.search}%`),
        ]),
      );
    }

    return query.orderBy('a.code', 'asc').execute();
  }

  async findOne(db: Kysely<TenantSchema>, accountId: number) {
    const account = await db
      .selectFrom('accounts')
      .where('id', '=', accountId)
      .selectAll()
      .executeTakeFirst();

    if (!account) throw new NotFoundException('Akun tidak ditemukan');
    return account;
  }

  async findByCode(db: Kysely<TenantSchema>, code: string) {
    const account = await db
      .selectFrom('accounts')
      .where('code', '=', code)
      .where('is_active', '=', true)
      .selectAll()
      .executeTakeFirst();

    if (!account)
      throw new NotFoundException(`Akun dengan kode "${code}" tidak ditemukan`);
    return account;
  }

  // Ambil akun sistem berdasarkan system_account key
  async getSystemAccount(db: Kysely<TenantSchema>, systemAccount: string) {
    const account = await db
      .selectFrom('accounts')
      .where('system_account', '=', systemAccount)
      .where('is_active', '=', true)
      .select(['id', 'code', 'name', 'account_type'])
      .executeTakeFirst();

    if (!account) {
      throw new ConflictException(
        `System account "${systemAccount}" tidak ditemukan. Pastikan Chart of Accounts sudah dikonfigurasi dengan benar.`,
      );
    }

    return account;
  }

  async create(db: Kysely<TenantSchema>, dto: CreateAccountDto) {
    const existing = await db
      .selectFrom('accounts')
      .where('code', '=', dto.code)
      .select('id')
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Kode akun "${dto.code}" sudah digunakan`);
    }

    let level = 1;
    if (dto.parentId) {
      const parent = await db
        .selectFrom('accounts')
        .where('id', '=', dto.parentId)
        .select(['id', 'level', 'is_header'])
        .executeTakeFirst();

      if (!parent) throw new NotFoundException('Akun parent tidak ditemukan');
      if (!parent.is_header) {
        throw new BadRequestException(
          'Akun parent harus berstatus header (is_header = true)',
        );
      }
      level = Number(parent.level) + 1;
    }

    const [account] = await db
      .insertInto('accounts')
      .values({
        code: dto.code,
        name: dto.name,
        parent_id: dto.parentId ?? null,
        account_type: dto.accountType,
        account_group: dto.accountGroup ?? null,
        is_header: dto.isHeader ?? false,
        level,
        is_active: true,
        notes: dto.notes ?? null,
      })
      .returningAll()
      .execute();

    return account;
  }

  async update(
    db: Kysely<TenantSchema>,
    accountId: number,
    dto: UpdateAccountDto,
  ) {
    const account = await db
      .selectFrom('accounts')
      .where('id', '=', accountId)
      .select(['id', 'system_account'])
      .executeTakeFirst();

    if (!account) throw new NotFoundException('Akun tidak ditemukan');

    if (dto.isActive === false && account.system_account) {
      throw new ConflictException(
        'System account tidak bisa dinonaktifkan. Akun ini dipakai untuk auto-posting jurnal.',
      );
    }

    const [updated] = await db
      .updateTable('accounts')
      .set({
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', accountId)
      .returningAll()
      .execute();

    return updated;
  }
}
