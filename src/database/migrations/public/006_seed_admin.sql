-- ============================================================
-- SEED DATA: Admin Tenant and Role
-- Dijalankan sekali oleh MigrationService saat startup
-- ============================================================

-- Insert tenant admin
INSERT INTO public.tenants (name, code, industry, is_active)
VALUES ('System Admin', 'admin', 'General', true)
ON CONFLICT (code) DO NOTHING;

-- Insert role Super Administrator
INSERT INTO public.roles (tenant_id, name, permissions)
SELECT t.id,
       'Super Administrator',
       '{
         "bom": ["read", "write", "delete", "approve", "export"],
         "mrp": ["read", "write", "delete", "approve", "export"],
         "bank": ["read", "write", "delete", "approve", "export"],
         "inventory": ["read", "write", "delete", "approve", "export"],
         "reporting": ["read", "write", "delete", "approve", "export"],
         "accounting": ["read", "write", "delete", "approve", "export"],
         "production": ["read", "write", "delete", "approve", "export"],
         "master_data": ["read", "write", "delete", "approve", "export"],
         "sales_order": ["read", "write", "delete", "approve", "export"],
         "goods_receipt": ["read", "write", "delete", "approve", "export"],
         "delivery_order": ["read", "write", "delete", "approve", "export"],
         "purchase_order": ["read", "write", "delete", "approve", "export"],
         "vendor_invoice": ["read", "write", "delete", "approve", "export"],
         "quality_control": ["read", "write", "delete", "approve", "export"],
         "role_management": ["read", "write", "delete", "approve", "export"],
         "sales_quotation": ["read", "write", "delete", "approve", "export"],
         "tenant_settings": ["read", "write", "delete", "approve", "export"],
         "user_management": ["read", "write", "delete", "approve", "export"],
         "customer_invoice": ["read", "write", "delete", "approve", "export"],
         "purchase_request": ["read", "write", "delete", "approve", "export"]
       }'::jsonb
FROM public.tenants t
WHERE t.code = 'admin'
ON CONFLICT DO NOTHING;

-- Insert tenant_secrets (hash_salt untuk HashID encoding)
INSERT INTO public.tenant_secrets (tenant_id, hash_salt)
SELECT t.id,
       replace(gen_random_uuid()::text, '-', '') ||
       replace(gen_random_uuid()::text, '-', '')
FROM public.tenants t
WHERE t.code = 'admin'
ON CONFLICT (tenant_id) DO NOTHING;
