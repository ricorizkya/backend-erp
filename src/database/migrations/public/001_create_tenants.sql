CREATE TABLE IF NOT EXISTS tenants (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    industry    VARCHAR(100),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_code ON tenants(code);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);
CREATE TABLE IF NOT EXISTS tenant_secrets (
    tenant_id   BIGINT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    hash_salt   VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
