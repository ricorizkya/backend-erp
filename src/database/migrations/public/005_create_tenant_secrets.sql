-- ============================================================
-- TENANT SECRETS
-- Menyimpan hash_salt unik per tenant untuk HashID encoding.
-- Salt di-generate saat tenant dibuat dan tidak boleh berubah
-- kecuali ada kebutuhan rotasi (yang akan invalidate semua
-- encoded IDs untuk tenant tersebut).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_secrets (
    tenant_id   BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    hash_salt   VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
