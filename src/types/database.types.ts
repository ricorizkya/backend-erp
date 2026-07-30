import { Generated, Insertable, Selectable, Updateable } from 'kysely';

// ================================================================
// PUBLIC SCHEMA
// ================================================================

export interface TenantsTable {
  id: Generated<number>;
  name: string;
  code: string;
  industry: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantSecretsTable {
  tenant_id: number;
  hash_salt: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<number>;
  tenant_id: number;
  email: string;
  password_hash: string;
  full_name: string;
  is_active: Generated<boolean>;
  last_login_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolesTable {
  id: Generated<number>;
  tenant_id: number;
  name: string;
  permissions: Record<string, unknown>;
  created_at: Generated<Date>;
}

export interface UserRolesTable {
  user_id: number;
  role_id: number;
}

export interface PublicSchema {
  tenants: TenantsTable;
  tenant_secrets: TenantSecretsTable;
  users: UsersTable;
  roles: RolesTable;
  user_roles: UserRolesTable;
  refresh_tokens: RefreshTokensTable;
}

// ================================================================
// TENANT SCHEMA
// ================================================================

export interface BranchesTable {
  id: Generated<number>;
  name: string;
  address: string | null;
  city: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface WarehousesTable {
  id: Generated<number>;
  branch_id: number;
  name: string;
  code: string;
  type: 'raw_material' | 'wip' | 'finished_goods';
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface UomTable {
  id: Generated<number>;
  name: string;
  symbol: string;
  created_at: Generated<Date>;
}

export interface UomConversionsTable {
  id: Generated<number>;
  from_uom_id: number;
  to_uom_id: number;
  factor: number;
  created_at: Generated<Date>;
}

export interface ProductCategoriesTable {
  id: Generated<number>;
  name: string;
  parent_id: number | null;
  created_at: Generated<Date>;
}

export interface AttributesTable {
  id: Generated<number>;
  name: string;
  created_at: Generated<Date>;
}

export interface AttributeValuesTable {
  id: Generated<number>;
  attribute_id: number;
  value: string;
  created_at: Generated<Date>;
}

export interface ProductsTable {
  id: Generated<number>;
  category_id: number | null;
  code: string;
  name: string;
  description: string | null;
  base_uom_id: number;
  purchase_uom_id: number;
  sales_uom_id: number;
  can_be_purchased: Generated<boolean>;
  can_be_sold: Generated<boolean>;
  can_be_manufactured: Generated<boolean>;
  has_variant: Generated<boolean>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductVariantsTable {
  id: Generated<number>;
  product_id: number;
  sku: string;
  name: string | null;
  cost_price: Generated<number>;
  sale_price: Generated<number>;
  min_stock: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductVariantAttributesTable {
  variant_id: number;
  attribute_value_id: number;
}

export interface BatchesTable {
  id: Generated<number>;
  variant_id: number;
  batch_number: string;
  manufacture_date: Date | null;
  expiry_date: Date | null;
  origin: string | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface SuppliersTable {
  id: Generated<number>;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  npwp: string | null;
  payment_term: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomersTable {
  id: Generated<number>;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  npwp: string | null;
  credit_limit: Generated<number>;
  payment_term: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantSchema {
  // Foundation
  branches: BranchesTable;
  warehouses: WarehousesTable;
  uom: UomTable;
  uom_conversions: UomConversionsTable;

  // Product master
  product_categories: ProductCategoriesTable;
  attributes: AttributesTable;
  attribute_values: AttributeValuesTable;
  products: ProductsTable;
  product_variants: ProductVariantsTable;
  product_variant_attributes: ProductVariantAttributesTable;
  batches: BatchesTable;

  // Business partners
  suppliers: SuppliersTable;
  customers: CustomersTable;

  // Inventory
  warehouse_locations: WarehouseLocationsTable;
  inventory_movement_types: InventoryMovementTypesTable;
  inventory_movements: InventoryMovementsTable;
  inventory_movement_items: InventoryMovementItemsTable;
  stock_opnames: StockOpnamesTable;
  stock_opname_items: StockOpnameItemsTable;
  stock_summary: StockSummaryTable;
  available_stock: AvailableStockTable;

  // Purchase Order
  document_counters: DocumentCountersTable;
  purchase_requests: PurchaseRequestsTable;
  purchase_request_items: PurchaseRequestItemsTable;
  rfqs: RfqsTable;
  rfq_items: RfqItemsTable;
  rfq_item_pr_items: RfqItemPrItemsTable;
  rfq_supplier_quotes: RfqSupplierQuotesTable;
  rfq_supplier_quote_items: RfqSupplierQuoteItemsTable;
  purchase_orders: PurchaseOrdersTable;
  purchase_order_items: PurchaseOrderItemsTable;
  goods_receipts: GoodsReceiptsTable;
  goods_receipt_items: GoodsReceiptItemsTable;
  vendor_invoices: VendorInvoicesTable;
  vendor_invoice_receipts: VendorInvoiceReceiptsTable;

  // Sales Order
  sales_quotations: SalesQuotationsTable;
  sales_quotation_items: SalesQuotationItemsTable;
  sales_orders: SalesOrdersTable;
  sales_order_items: SalesOrderItemsTable;
  delivery_orders: DeliveryOrdersTable;
  delivery_order_items: DeliveryOrderItemsTable;
  customer_invoices: CustomerInvoicesTable;
  customer_invoice_deliveries: CustomerInvoiceDeliveriesTable;
  payment_receipts: PaymentReceiptsTable;
  payment_receipt_allocations: PaymentReceiptAllocationsTable;

  // BOM
  bom_headers: BomHeadersTable;
  bom_versions: BomVersionsTable;
  bom_items: BomItemsTable;
  bom_operations: BomOperationsTable;
  bom_by_products: BomByProductsTable;

  // Production Planning
  mrp_demands: MrpDemandsTable;
  mrp_runs: MrpRunsTable;
  planned_orders: PlannedOrdersTable;
  planned_order_demands: PlannedOrderDemandsTable;
  work_orders: WorkOrdersTable;
  work_order_materials: WorkOrderMaterialsTable;
  work_order_material_lots: WorkOrderMaterialLotsTable;
  work_order_operations: WorkOrderOperationsTable;
  production_results: ProductionResultsTable;
  production_result_by_products: ProductionResultByProductsTable;

  // Quality Control
  qc_parameters: QcParametersTable;
  qc_checklists: QcChecklistsTable;
  qc_checklist_items: QcChecklistItemsTable;
  qc_inspections: QcInspectionsTable;
  qc_inspection_items: QcInspectionItemsTable;
  qc_defect_types: QcDefectTypesTable;
  qc_defects: QcDefectsTable;

  // Accounting
  fiscal_years: FiscalYearsTable;
  accounting_periods: AccountingPeriodsTable;
  accounts: AccountsTable;
  journal_entries: JournalEntriesTable;
  journal_entry_lines: JournalEntryLinesTable;
  general_ledger: GeneralLedgerTable;
  account_balances: AccountBalancesTable;
  ap_transactions: ApTransactionsTable;
  ap_payments: ApPaymentsTable;
  ap_payment_allocations: ApPaymentAllocationsTable;
  ar_transactions: ArTransactionsTable;
  ar_receipt_allocations: ArReceiptAllocationsTable;
  bank_accounts: BankAccountsTable;
  bank_transactions: BankTransactionsTable;
  bank_reconciliations: BankReconciliationsTable;
  tax_codes: TaxCodesTable;
  tax_lines: TaxLinesTable;
  overhead_rates: OverheadRatesTable;
  production_cost_sheets: ProductionCostSheetsTable;
  production_cost_details: ProductionCostDetailsTable;
}

// ================================================================
// HELPER TYPES — gunakan ini di service layer
// ================================================================

export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Product = Selectable<ProductsTable>;
export type NewProduct = Insertable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;

export type ProductVariant = Selectable<ProductVariantsTable>;
export type NewProductVariant = Insertable<ProductVariantsTable>;
export type ProductVariantUpdate = Updateable<ProductVariantsTable>;

export type Supplier = Selectable<SuppliersTable>;
export type NewSupplier = Insertable<SuppliersTable>;
export type SupplierUpdate = Updateable<SuppliersTable>;

export type Customer = Selectable<CustomersTable>;
export type NewCustomer = Insertable<CustomersTable>;
export type CustomerUpdate = Updateable<CustomersTable>;

export type Batch = Selectable<BatchesTable>;
export type NewBatch = Insertable<BatchesTable>;

export type Warehouse = Selectable<WarehousesTable>;
export type NewWarehouse = Insertable<WarehousesTable>;
export type WarehouseUpdate = Updateable<WarehousesTable>;

// ================================================================
// INVENTORY TABLES (tambahan ke TenantSchema)
// ================================================================

export interface WarehouseLocationsTable {
  id: Generated<number>;
  warehouse_id: number;
  code: string;
  name: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface InventoryMovementTypesTable {
  id: Generated<number>;
  code: string;
  name: string;
  direction: 'in' | 'out' | 'transfer';
  description: string | null;
  created_at: Generated<Date>;
}

export interface InventoryMovementsTable {
  id: Generated<number>;
  movement_type_id: number;
  reference_type: string | null;
  reference_id: number | null;
  movement_date: Date;
  notes: string | null;
  status: Generated<'draft' | 'confirmed' | 'cancelled'>;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InventoryMovementItemsTable {
  id: Generated<number>;
  movement_id: number;
  variant_id: number;
  batch_id: number | null;
  from_warehouse_id: number | null;
  from_location_id: number | null;
  to_warehouse_id: number | null;
  to_location_id: number | null;
  quantity: number;
  uom_id: number;
  unit_cost: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface StockOpnamesTable {
  id: Generated<number>;
  warehouse_id: number;
  opname_date: Date;
  status: Generated<'draft' | 'counting' | 'completed' | 'cancelled'>;
  notes: string | null;
  created_by: number;
  completed_by: number | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockOpnameItemsTable {
  id: Generated<number>;
  opname_id: number;
  variant_id: number;
  batch_id: number | null;
  system_quantity: Generated<number>;
  actual_quantity: number | null;
  difference: number | null; // generated column
  notes: string | null;
  created_at: Generated<Date>;
}

export interface StockSummaryTable {
  variant_id: number;
  warehouse_id: number;
  batch_id: number | null;
  quantity_on_hand: number;
}

export interface AvailableStockTable {
  variant_id: number;
  warehouse_id: number;
  batch_id: number | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
}

// ================================================================
// PURCHASE ORDER TABLES
// ================================================================

export interface PurchaseRequestsTable {
  id: Generated<number>;
  number: string;
  request_date: Date;
  needed_date: Date | null;
  warehouse_id: number;
  status: Generated<'draft' | 'submitted' | 'approved' | 'rejected' | 'closed'>;
  notes: string | null;
  created_by: number;
  submitted_by: number | null;
  submitted_at: Date | null;
  approved_by: number | null;
  approved_at: Date | null;
  rejected_by: number | null;
  rejected_at: Date | null;
  rejection_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseRequestItemsTable {
  id: Generated<number>;
  pr_id: number;
  variant_id: number;
  quantity: number;
  uom_id: number;
  estimated_price: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface RfqsTable {
  id: Generated<number>;
  number: string;
  rfq_date: Date;
  deadline_date: Date | null;
  status: Generated<'draft' | 'sent' | 'closed' | 'cancelled'>;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RfqItemsTable {
  id: Generated<number>;
  rfq_id: number;
  variant_id: number;
  quantity: number;
  uom_id: number;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface RfqItemPrItemsTable {
  rfq_item_id: number;
  pr_item_id: number;
}

export interface RfqSupplierQuotesTable {
  id: Generated<number>;
  rfq_id: number;
  supplier_id: number;
  quote_date: Date;
  valid_until: Date | null;
  status: Generated<'pending' | 'received' | 'selected' | 'rejected'>;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RfqSupplierQuoteItemsTable {
  id: Generated<number>;
  quote_id: number;
  rfq_item_id: number;
  unit_price: Generated<number>;
  quantity: number;
  uom_id: number;
  lead_time_days: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface PurchaseOrdersTable {
  id: Generated<number>;
  number: string;
  supplier_id: number;
  rfq_supplier_quote_id: number | null;
  po_date: Date;
  expected_date: Date | null;
  warehouse_id: number;
  status: Generated<
    'draft' | 'confirmed' | 'partial' | 'received' | 'cancelled'
  >;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  discount_amount: Generated<number>;
  total_amount: Generated<number>;
  payment_term_days: Generated<number>;
  shipping_address: string | null;
  notes: string | null;
  terms_conditions: string | null;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  cancellation_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseOrderItemsTable {
  id: Generated<number>;
  po_id: number;
  variant_id: number;
  rfq_quote_item_id: number | null;
  quantity: number;
  uom_id: number;
  unit_price: Generated<number>;
  discount_pct: Generated<number>;
  tax_pct: Generated<number>;
  subtotal: Generated<number>;
  quantity_received: Generated<number>;
  quantity_pending: number | null; // generated column
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GoodsReceiptsTable {
  id: Generated<number>;
  number: string;
  po_id: number;
  warehouse_id: number;
  receipt_date: Date;
  supplier_do_number: string | null;
  status: Generated<'draft' | 'confirmed' | 'cancelled'>;
  inventory_movement_id: number | null;
  notes: string | null;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GoodsReceiptItemsTable {
  id: Generated<number>;
  gr_id: number;
  po_item_id: number;
  variant_id: number;
  batch_id: number | null;
  quantity_received: number;
  uom_id: number;
  location_id: number | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface VendorInvoicesTable {
  id: Generated<number>;
  number: string;
  supplier_invoice_no: string;
  supplier_id: number;
  po_id: number;
  invoice_date: Date;
  due_date: Date;
  status: Generated<'unpaid' | 'partial' | 'paid' | 'cancelled'>;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  total_amount: Generated<number>;
  paid_amount: Generated<number>;
  outstanding_amount: number | null; // generated column
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VendorInvoiceReceiptsTable {
  invoice_id: number;
  gr_id: number;
}

export interface DocumentCountersTable {
  doc_type: string;
  year: number;
  counter: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ================================================================
// SALES ORDER TABLES
// ================================================================

export interface SalesQuotationsTable {
  id: Generated<number>;
  number: string;
  customer_id: number;
  quotation_date: Date;
  valid_until: Date | null;
  status: Generated<
    'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
  >;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  discount_amount: Generated<number>;
  total_amount: Generated<number>;
  payment_term_days: Generated<number>;
  delivery_address: string | null;
  notes: string | null;
  terms_conditions: string | null;
  created_by: number;
  sent_by: number | null;
  sent_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesQuotationItemsTable {
  id: Generated<number>;
  quotation_id: number;
  variant_id: number;
  quantity: number;
  uom_id: number;
  unit_price: Generated<number>;
  discount_pct: Generated<number>;
  tax_pct: Generated<number>;
  subtotal: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface SalesOrdersTable {
  id: Generated<number>;
  number: string;
  customer_id: number;
  quotation_id: number | null;
  order_date: Date;
  requested_date: Date | null;
  warehouse_id: number;
  status: Generated<
    'draft' | 'confirmed' | 'partial' | 'delivered' | 'invoiced' | 'cancelled'
  >;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  discount_amount: Generated<number>;
  total_amount: Generated<number>;
  payment_term_days: Generated<number>;
  delivery_address: string | null;
  notes: string | null;
  terms_conditions: string | null;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  cancellation_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesOrderItemsTable {
  id: Generated<number>;
  so_id: number;
  variant_id: number;
  quotation_item_id: number | null;
  quantity: number;
  uom_id: number;
  unit_price: Generated<number>;
  discount_pct: Generated<number>;
  tax_pct: Generated<number>;
  subtotal: Generated<number>;
  quantity_delivered: Generated<number>;
  quantity_pending: number | null; // generated column
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryOrdersTable {
  id: Generated<number>;
  number: string;
  so_id: number;
  warehouse_id: number;
  delivery_date: Date;
  receiver_name: string | null;
  delivery_address: string | null;
  status: Generated<'draft' | 'confirmed' | 'cancelled'>;
  inventory_movement_id: number | null;
  notes: string | null;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryOrderItemsTable {
  id: Generated<number>;
  do_id: number;
  so_item_id: number;
  variant_id: number;
  batch_id: number | null;
  quantity_delivered: number;
  uom_id: number;
  location_id: number | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface CustomerInvoicesTable {
  id: Generated<number>;
  number: string;
  customer_id: number;
  so_id: number;
  invoice_date: Date;
  due_date: Date;
  status: Generated<'unpaid' | 'partial' | 'paid' | 'cancelled'>;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  total_amount: Generated<number>;
  paid_amount: Generated<number>;
  outstanding_amount: number | null; // generated column
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomerInvoiceDeliveriesTable {
  invoice_id: number;
  do_id: number;
}

export interface PaymentReceiptsTable {
  id: Generated<number>;
  number: string;
  customer_id: number;
  payment_date: Date;
  payment_method: 'cash' | 'transfer' | 'cheque' | 'giro' | 'other';
  reference_no: string | null;
  amount: number;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
}

export interface PaymentReceiptAllocationsTable {
  id: Generated<number>;
  payment_id: number;
  invoice_id: number;
  amount: number;
  created_at: Generated<Date>;
}

// ================================================================
// BOM TABLES
// ================================================================

export interface BomHeadersTable {
  id: Generated<number>;
  variant_id: number;
  name: string;
  notes: string | null;
  is_active: Generated<boolean>;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BomVersionsTable {
  id: Generated<number>;
  bom_header_id: number;
  version_number: number;
  version_name: string | null;
  status: Generated<'draft' | 'active' | 'obsolete'>;
  output_quantity: Generated<number>;
  output_uom_id: number;
  effective_from: Date;
  effective_to: Date | null;
  notes: string | null;
  created_by: number;
  approved_by: number | null;
  approved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BomItemsTable {
  id: Generated<number>;
  bom_version_id: number;
  parent_item_id: number | null;
  variant_id: number;
  is_phantom: Generated<boolean>;
  quantity: number;
  uom_id: number;
  scrap_pct: Generated<number>;
  quantity_with_scrap: number | null;
  level: Generated<number>;
  sequence: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BomOperationsTable {
  id: Generated<number>;
  bom_version_id: number;
  sequence: number;
  name: string;
  work_center: string | null;
  duration_minutes: Generated<number>;
  cost_per_minute: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface BomByProductsTable {
  id: Generated<number>;
  bom_version_id: number;
  variant_id: number;
  quantity: number;
  uom_id: number;
  type: Generated<'by_product' | 'scrap' | 'co_product'>;
  cost_share_pct: Generated<number>;
  notes: string | null;
  created_at: Generated<Date>;
}

// ================================================================
// PRODUCTION PLANNING TABLES
// ================================================================

export interface MrpDemandsTable {
  id: Generated<number>;
  variant_id: number;
  demand_type: 'sales_order' | 'forecast' | 'safety_stock';
  so_id: number | null;
  so_item_id: number | null;
  quantity: number;
  uom_id: number;
  needed_date: Date;
  warehouse_id: number;
  status: Generated<'open' | 'planned' | 'fulfilled' | 'cancelled'>;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MrpRunsTable {
  id: Generated<number>;
  run_date: Generated<Date>;
  plan_from: Date;
  plan_to: Date;
  status: Generated<'running' | 'completed' | 'failed'>;
  total_planned_production: Generated<number>;
  total_planned_purchase: Generated<number>;
  error_message: string | null;
  duration_ms: string | null;
  triggered_by: number;
  created_at: Generated<Date>;
}

export interface PlannedOrdersTable {
  id: Generated<number>;
  mrp_run_id: number;
  variant_id: number;
  order_type: 'production' | 'purchase';
  quantity: number;
  uom_id: number;
  planned_start: Date;
  planned_finish: Date;
  bom_version_id: number | null;
  suggested_supplier_id: number | null;
  status: Generated<'proposed' | 'approved' | 'cancelled'>;
  work_order_id: number | null;
  purchase_order_id: number | null;
  notes: string | null;
  approved_by: number | null;
  approved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PlannedOrderDemandsTable {
  planned_order_id: number;
  demand_id: number;
  quantity_allocated: number;
}

export interface WorkOrdersTable {
  id: Generated<number>;
  number: string;
  planned_order_id: number | null;
  so_id: number | null;
  so_item_id: number | null;
  variant_id: number;
  bom_version_id: number;
  quantity_planned: number;
  quantity_produced: Generated<number>;
  uom_id: number;
  output_warehouse_id: number;
  planned_start: Date;
  planned_finish: Date;
  actual_start: Date | null;
  actual_finish: Date | null;
  status: Generated<
    | 'draft'
    | 'confirmed'
    | 'in_progress'
    | 'completed'
    | 'partially_done'
    | 'cancelled'
  >;
  production_type: Generated<'mts' | 'mto'>;
  notes: string | null;
  created_by: number;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  completed_by: number | null;
  completed_at: Date | null;
  cancelled_by: number | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkOrderMaterialsTable {
  id: Generated<number>;
  work_order_id: number;
  bom_item_id: number | null;
  variant_id: number;
  quantity_planned: number;
  uom_id: number;
  quantity_consumed: Generated<number>;
  warehouse_id: number;
  status: Generated<'pending' | 'partial' | 'consumed' | 'cancelled'>;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkOrderMaterialLotsTable {
  id: Generated<number>;
  wo_material_id: number;
  batch_id: number | null;
  quantity_consumed: number;
  consumed_at: Generated<Date>;
  consumed_by: number;
  inventory_movement_id: number | null;
}

export interface WorkOrderOperationsTable {
  id: Generated<number>;
  work_order_id: number;
  bom_operation_id: number | null;
  sequence: number;
  name: string;
  work_center: string | null;
  planned_duration_minutes: Generated<number>;
  actual_start: Date | null;
  actual_finish: Date | null;
  actual_duration_minutes: number | null; // generated column
  status: Generated<'pending' | 'in_progress' | 'completed' | 'skipped'>;
  operator_id: number | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductionResultsTable {
  id: Generated<number>;
  work_order_id: number;
  result_date: Generated<Date>;
  variant_id: number;
  quantity_produced: number;
  uom_id: number;
  batch_id: number | null;
  warehouse_id: number;
  inventory_movement_id: number | null;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
}

export interface ProductionResultByProductsTable {
  id: Generated<number>;
  production_result_id: number;
  variant_id: number;
  quantity: number;
  uom_id: number;
  type: 'by_product' | 'scrap' | 'co_product';
  warehouse_id: number;
  inventory_movement_id: number | null;
  created_at: Generated<Date>;
}

// ================================================================
// QUALITY CONTROL TABLES
// ================================================================

export interface QcParametersTable {
  id: Generated<number>;
  code: string;
  name: string;
  description: string | null;
  value_type: Generated<'pass_fail' | 'numeric' | 'text'>;
  min_value: string | null;
  max_value: string | null;
  unit: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QcChecklistsTable {
  id: Generated<number>;
  name: string;
  inspection_type: 'incoming' | 'final';
  product_category_id: number | null;
  is_active: Generated<boolean>;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QcChecklistItemsTable {
  id: Generated<number>;
  checklist_id: number;
  parameter_id: number;
  sequence: Generated<number>;
  is_required: Generated<boolean>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface QcInspectionsTable {
  id: Generated<number>;
  number: string;
  checklist_id: number;
  inspection_type: 'incoming' | 'final';
  goods_receipt_id: number | null;
  production_result_id: number | null;
  variant_id: number;
  batch_id: number | null;
  quantity_to_inspect: number;
  quantity_inspected: Generated<number>;
  uom_id: number;
  inspection_date: Date;
  result: 'passed' | 'passed_with_note' | 'failed' | null;
  disposition:
    | 'accepted'
    | 'accepted_with_debit'
    | 'rework'
    | 'rejected'
    | 'pending'
    | null;
  status: Generated<'draft' | 'completed' | 'cancelled'>;
  notes: string | null;
  created_by: number;
  inspected_by: number | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QcInspectionItemsTable {
  id: Generated<number>;
  inspection_id: number;
  checklist_item_id: number;
  parameter_id: number;
  pass_fail_value: boolean | null;
  numeric_value: number | null;
  text_value: string | null;
  is_within_spec: boolean | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface QcDefectTypesTable {
  id: Generated<number>;
  code: string;
  name: string;
  severity: Generated<'critical' | 'major' | 'minor'>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface QcDefectsTable {
  id: Generated<number>;
  inspection_id: number;
  defect_type_id: number;
  quantity_defective: number;
  uom_id: number;
  description: string | null;
  disposition: Generated<'pending' | 'rework' | 'reject' | 'accept_as_is'>;
  created_at: Generated<Date>;
}

// ================================================================
// ACCOUNTING TABLES
// ================================================================

export interface FiscalYearsTable {
  id: Generated<number>;
  name: string;
  start_date: Date;
  end_date: Date;
  status: Generated<'open' | 'closed'>;
  created_by: number;
  created_at: Generated<Date>;
}

export interface AccountingPeriodsTable {
  id: Generated<number>;
  fiscal_year_id: number;
  name: string;
  period_number: number;
  start_date: Date;
  end_date: Date;
  status: Generated<'open' | 'closed' | 'locked'>;
  created_at: Generated<Date>;
}

export interface AccountsTable {
  id: Generated<number>;
  code: string;
  name: string;
  parent_id: number | null;
  account_type:
    | 'asset'
    | 'liability'
    | 'equity'
    | 'revenue'
    | 'expense'
    | 'cost_of_goods';
  account_group: string | null;
  is_header: Generated<boolean>;
  system_account: string | null;
  level: Generated<number>;
  is_active: Generated<boolean>;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: Generated<number>;
  number: string;
  period_id: number;
  entry_date: Date;
  entry_type:
    | 'general'
    | 'purchase'
    | 'sales'
    | 'payment'
    | 'inventory'
    | 'production'
    | 'cost_of_goods'
    | 'adjustment'
    | 'closing';
  folio: string | null;
  reference_type: string | null;
  reference_id: number | null;
  description: string;
  status: Generated<'draft' | 'posted' | 'reversed'>;
  reversed_by: number | null;
  reversal_of: string | null;
  total_debit: Generated<number>;
  total_credit: Generated<number>;
  created_by: number;
  posted_by: number | null;
  posted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntryLinesTable {
  id: Generated<number>;
  journal_entry_id: number;
  account_id: number;
  line_number: number;
  folio: string | null;
  debit: Generated<number>;
  credit: Generated<number>;
  description: string | null;
  cost_center: string | null;
  created_at: Generated<Date>;
}

export interface GeneralLedgerTable {
  id: Generated<number>;
  account_id: number;
  period_id: number;
  journal_entry_id: number;
  journal_line_id: number;
  entry_date: Date;
  folio: string;
  debit: Generated<number>;
  credit: Generated<number>;
  balance: Generated<number>;
  description: string | null;
  created_at: Generated<Date>;
}

export interface AccountBalancesTable {
  id: Generated<number>;
  account_id: number;
  period_id: number;
  opening_balance: Generated<number>;
  total_debit: Generated<number>;
  total_credit: Generated<number>;
  closing_balance: Generated<number>;
  updated_at: Generated<Date>;
}

export interface ApTransactionsTable {
  id: Generated<number>;
  vendor_invoice_id: number;
  supplier_id: number;
  journal_entry_id: number | null;
  transaction_date: Date;
  due_date: Date;
  amount: number;
  paid_amount: Generated<number>;
  outstanding_amount: number | null; // generated
  status: Generated<'open' | 'partial' | 'paid' | 'cancelled'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ApPaymentsTable {
  id: Generated<number>;
  number: string;
  supplier_id: number;
  payment_date: Date;
  payment_method: 'cash' | 'transfer' | 'cheque' | 'giro' | 'other';
  bank_account_id: number | null;
  reference_no: string | null;
  amount: number;
  journal_entry_id: number | null;
  notes: string | null;
  created_by: number;
  created_at: Generated<Date>;
}

export interface ApPaymentAllocationsTable {
  id: Generated<number>;
  ap_payment_id: number;
  ap_transaction_id: number;
  amount: number;
  created_at: Generated<Date>;
}

export interface ArTransactionsTable {
  id: Generated<number>;
  customer_invoice_id: number;
  customer_id: number;
  journal_entry_id: number | null;
  transaction_date: Date;
  due_date: Date;
  amount: number;
  received_amount: Generated<number>;
  outstanding_amount: number | null; // generated
  status: Generated<'open' | 'partial' | 'paid' | 'cancelled'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ArReceiptAllocationsTable {
  id: Generated<number>;
  payment_receipt_id: number;
  ar_transaction_id: number;
  journal_entry_id: number | null;
  amount: number;
  created_at: Generated<Date>;
}

export interface BankAccountsTable {
  id: Generated<number>;
  account_id: number;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  branch_name: string | null;
  currency: Generated<string>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BankTransactionsTable {
  id: Generated<number>;
  bank_account_id: number;
  transaction_date: Date;
  transaction_type: 'debit' | 'credit';
  amount: number;
  reference_no: string | null;
  description: string | null;
  journal_entry_id: number | null;
  is_reconciled: Generated<boolean>;
  reconciled_at: Date | null;
  reconciled_by: number | null;
  created_by: number;
  created_at: Generated<Date>;
}

export interface BankReconciliationsTable {
  id: Generated<number>;
  bank_account_id: number;
  period_id: number;
  reconciliation_date: Date;
  statement_balance: number;
  book_balance: number;
  difference: number | null; // generated
  status: Generated<'draft' | 'completed'>;
  notes: string | null;
  created_by: number;
  completed_by: number | null;
  completed_at: Date | null;
  created_at: Generated<Date>;
}

export interface TaxCodesTable {
  id: Generated<number>;
  code: string;
  name: string;
  tax_type: 'ppn' | 'pph';
  rate: number;
  account_id: number;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface TaxLinesTable {
  id: Generated<number>;
  tax_code_id: number;
  reference_type: string;
  reference_id: number;
  taxable_amount: number;
  tax_amount: number;
  journal_entry_id: number | null;
  created_at: Generated<Date>;
}

export interface OverheadRatesTable {
  id: Generated<number>;
  period_id: number;
  name: string;
  rate_type: 'per_unit' | 'per_labor_hour' | 'per_machine_hour' | 'percentage';
  rate: number;
  account_id: number;
  created_by: number;
  created_at: Generated<Date>;
}

export interface ProductionCostSheetsTable {
  id: Generated<number>;
  work_order_id: number;
  period_id: number;
  calculation_date: Generated<Date>;
  raw_material_cost: Generated<number>;
  labor_cost: Generated<number>;
  overhead_cost: Generated<number>;
  by_product_offset: Generated<number>;
  total_cost: Generated<number>;
  quantity_produced: number;
  uom_id: number;
  cost_per_unit: Generated<number>;
  status: Generated<'draft' | 'posted' | 'revised'>;
  journal_entry_id: number | null;
  calculated_by: number;
  posted_by: number | null;
  posted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductionCostDetailsTable {
  id: Generated<number>;
  cost_sheet_id: number;
  cost_type: 'raw_material' | 'labor' | 'overhead' | 'by_product';
  reference_id: number | null;
  description: string;
  quantity: number | null;
  unit_cost: number | null;
  total_cost: number;
  account_id: number | null;
  created_at: Generated<Date>;
}

// ================================================================
// AUTH TABLES (public schema)
// ================================================================

export interface RefreshTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  is_revoked: Generated<boolean>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Date>;
}
