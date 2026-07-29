import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Kysely } from 'kysely';
import { TenantSchema } from '../../../types/database.types';
import {
  CreateVendorInvoiceDto,
  PaginationDto,
} from '../dto/purchase-order.dto';
import { DocumentNumberService } from './document-number.service';

@Injectable()
export class VendorInvoiceService {
  constructor(private readonly docNumber: DocumentNumberService) {}

  // ----------------------------------------------------------------
  // LIST
  // ----------------------------------------------------------------

  async findAll(db: Kysely<TenantSchema>, filter: PaginationDto) {
    const { page, limit, search, status, dateFrom, dateTo } = filter;

    let query = db
      .selectFrom('vendor_invoices as vi')
      .innerJoin('suppliers as s', 's.id', 'vi.supplier_id')
      .innerJoin('purchase_orders as po', 'po.id', 'vi.po_id')
      .select([
        'vi.id',
        'vi.number',
        'vi.supplier_invoice_no',
        'vi.invoice_date',
        'vi.due_date',
        'vi.status',
        'vi.total_amount',
        'vi.paid_amount',
        'vi.outstanding_amount',
        'vi.notes',
        'vi.created_at',
        's.code as supplier_code',
        's.name as supplier_name',
        'po.number as po_number',
      ]);

    if (status) query = query.where('vi.status', '=', status as any);
    if (dateFrom) query = query.where('vi.invoice_date', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('vi.invoice_date', '<=', new Date(dateTo));
    if (search) {
      query = query.where((eb) =>
        eb.or([
          eb('vi.number', 'ilike', `%${search}%`),
          eb('vi.supplier_invoice_no', 'ilike', `%${search}%`),
          eb('s.name', 'ilike', `%${search}%`),
        ]),
      );
    }

    const total = Number(
      (
        await query
          .clearSelect()
          .select(db.fn.countAll<number>().as('c'))
          .executeTakeFirst()
      )?.c ?? 0,
    );

    const data = await query
      .orderBy('vi.invoice_date', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .execute();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ----------------------------------------------------------------
  // DETAIL
  // ----------------------------------------------------------------

  async findOne(db: Kysely<TenantSchema>, invoiceId: number) {
    const invoice = await db
      .selectFrom('vendor_invoices as vi')
      .innerJoin('suppliers as s', 's.id', 'vi.supplier_id')
      .innerJoin('purchase_orders as po', 'po.id', 'vi.po_id')
      .where('vi.id', '=', invoiceId)
      .select([
        'vi.id',
        'vi.number',
        'vi.supplier_invoice_no',
        'vi.supplier_id',
        'vi.po_id',
        'vi.invoice_date',
        'vi.due_date',
        'vi.status',
        'vi.subtotal',
        'vi.tax_amount',
        'vi.total_amount',
        'vi.paid_amount',
        'vi.outstanding_amount',
        'vi.notes',
        'vi.created_by',
        'vi.created_at',
        's.code as supplier_code',
        's.name as supplier_name',
        'po.number as po_number',
      ])
      .executeTakeFirst();

    if (!invoice) throw new NotFoundException('Vendor Invoice tidak ditemukan');

    // GR yang di-cover invoice ini
    const linkedGrs = await db
      .selectFrom('vendor_invoice_receipts as vir')
      .innerJoin('goods_receipts as gr', 'gr.id', 'vir.gr_id')
      .where('vir.invoice_id', '=', invoiceId)
      .select([
        'gr.id',
        'gr.number',
        'gr.receipt_date',
        'gr.supplier_do_number',
      ])
      .execute();

    return { ...invoice, goodsReceipts: linkedGrs };
  }

  // ----------------------------------------------------------------
  // CREATE
  // ----------------------------------------------------------------

  async create(
    db: Kysely<TenantSchema>,
    dto: CreateVendorInvoiceDto,
    createdBy: number,
  ) {
    // Validasi PO
    const po = await db
      .selectFrom('purchase_orders')
      .where('id', '=', dto.poId)
      .where('status', 'in', ['confirmed', 'partial', 'received'])
      .select(['id', 'supplier_id', 'total_amount'])
      .executeTakeFirst();

    if (!po) {
      throw new NotFoundException(
        'Purchase Order tidak ditemukan atau belum dikonfirmasi',
      );
    }

    // Validasi GR IDs semuanya confirmed dan milik PO ini
    if (!dto.grIds.length) {
      throw new BadRequestException('Minimal satu Goods Receipt diperlukan');
    }

    const grs = await db
      .selectFrom('goods_receipts')
      .where('id', 'in', dto.grIds)
      .where('po_id', '=', dto.poId)
      .where('status', '=', 'confirmed')
      .select(['id'])
      .execute();

    if (grs.length !== dto.grIds.length) {
      throw new BadRequestException(
        'Satu atau lebih GR tidak valid, bukan milik PO ini, atau belum dikonfirmasi',
      );
    }

    // Cek GR belum dipakai di invoice lain
    const alreadyInvoiced = await db
      .selectFrom('vendor_invoice_receipts as vir')
      .innerJoin('vendor_invoices as vi', 'vi.id', 'vir.invoice_id')
      .where('vir.gr_id', 'in', dto.grIds)
      .where('vi.status', '!=', 'cancelled')
      .select('vir.gr_id')
      .executeTakeFirst();

    if (alreadyInvoiced) {
      throw new ConflictException(
        `GR ${alreadyInvoiced.gr_id} sudah ada di invoice lain`,
      );
    }

    return db.transaction().execute(async (trx) => {
      const number = await this.docNumber.generate(trx, 'VI');

      // Ambil total dari PO sebagai basis invoice
      const total = Number(po.total_amount);
      const subtotal = Math.round((total / 1.11) * 100) / 100; // asumsi PPN 11%
      const taxAmount = total - subtotal;

      const [invoice] = await trx
        .insertInto('vendor_invoices')
        .values({
          number,
          supplier_invoice_no: dto.supplierInvoiceNo,
          supplier_id: po.supplier_id,
          po_id: dto.poId,
          invoice_date: new Date(dto.invoiceDate),
          due_date: new Date(dto.dueDate),
          status: 'unpaid',
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          paid_amount: 0,
          notes: dto.notes ?? null,
          created_by: createdBy,
        })
        .returningAll()
        .execute();

      // Link invoice ke GR
      await trx
        .insertInto('vendor_invoice_receipts')
        .values(
          dto.grIds.map((grId) => ({
            invoice_id: invoice.id,
            gr_id: grId,
          })),
        )
        .execute();

      return this.findOne(trx, invoice.id);
    });
  }

  // ----------------------------------------------------------------
  // UPDATE PAID AMOUNT (dipanggil internal dari AP payment)
  // ----------------------------------------------------------------

  async updatePaidAmount(
    db: Kysely<TenantSchema>,
    invoiceId: number,
    paidAmount: number,
  ) {
    const invoice = await db
      .selectFrom('vendor_invoices')
      .where('id', '=', invoiceId)
      .select(['id', 'total_amount', 'status'])
      .executeTakeFirst();

    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');
    if (invoice.status === 'cancelled') {
      throw new ConflictException('Invoice sudah dibatalkan');
    }

    const total = Number(invoice.total_amount);
    const newStatus =
      paidAmount >= total
        ? 'paid'
        : paidAmount > 0
          ? 'partial'
          : 'unpaid';

    await db
      .updateTable('vendor_invoices')
      .set({
        paid_amount: paidAmount,
        status: newStatus,
        updated_at: new Date(),
      })
      .where('id', '=', invoiceId)
      .execute();
  }

  // ----------------------------------------------------------------
  // CANCEL
  // ----------------------------------------------------------------

  async cancel(db: Kysely<TenantSchema>, invoiceId: number) {
    const invoice = await db
      .selectFrom('vendor_invoices')
      .where('id', '=', invoiceId)
      .select(['id', 'status', 'paid_amount'])
      .executeTakeFirst();

    if (!invoice) throw new NotFoundException('Invoice tidak ditemukan');

    if (invoice.status === 'paid') {
      throw new ConflictException('Invoice yang sudah lunas tidak bisa dibatalkan');
    }
    if (Number(invoice.paid_amount) > 0) {
      throw new ConflictException(
        'Invoice yang sudah ada pembayaran tidak bisa dibatalkan langsung. ' +
          'Batalkan pembayarannya terlebih dahulu.',
      );
    }

    const [updated] = await db
      .updateTable('vendor_invoices')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('id', '=', invoiceId)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // OVERDUE LIST — invoice lewat due_date dan belum lunas
  // ----------------------------------------------------------------

  async findOverdue(db: Kysely<TenantSchema>) {
    return db
      .selectFrom('vendor_invoices as vi')
      .innerJoin('suppliers as s', 's.id', 'vi.supplier_id')
      .where('vi.due_date', '<', new Date())
      .where('vi.status', 'in', ['unpaid', 'partial'])
      .select([
        'vi.id',
        'vi.number',
        'vi.invoice_date',
        'vi.due_date',
        'vi.outstanding_amount',
        's.name as supplier_name',
        's.phone as supplier_phone',
      ])
      .orderBy('vi.due_date', 'asc')
      .execute();
  }
}
