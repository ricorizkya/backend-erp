-- ============================================================
-- SEED DATA: Admin Tenant, User, Role
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

-- Insert admin user (password: Admin@1234 - bcrypt hash)
INSERT INTO public.users (tenant_id, email, password_hash, full_name, is_active)
SELECT t.id,
       'admin@synkro.com',
       '$2b$12$FxzVTa0z/8MAly2pbNE.buqXyJuULvJKsiBK5nEvGGfQ5bg03Sl5m',
       'Super Administrator',
       true
FROM public.tenants t
WHERE t.code = 'admin'
ON CONFLICT (email) DO NOTHING;

-- Assign role to user
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
JOIN public.tenants t ON t.id = u.tenant_id
JOIN public.roles r ON r.tenant_id = t.id
WHERE u.email = 'admin@synkro.com'
  AND r.name = 'Super Administrator'
ON CONFLICT DO NOTHING;

-- Insert tenant_secrets (hash_salt untuk HashID encoding)
INSERT INTO public.tenant_secrets (tenant_id, hash_salt)
SELECT t.id, 'synkro_admin_salt_2026_erp_hashid'
FROM public.tenants t
WHERE t.code = 'admin'
ON CONFLICT (tenant_id) DO NOTHING;
