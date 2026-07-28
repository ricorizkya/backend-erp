CREATE TABLE IF NOT EXISTS branches (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    address     TEXT,
    city        VARCHAR(100),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id   BIGINT NOT NULL REFERENCES branches(id),
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50) UNIQUE NOT NULL,
    type        VARCHAR(50) NOT NULL 
                CHECK (type IN ('raw_material', 'wip', 'finished_goods')),
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uom (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uom_conversions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_uom_id BIGINT NOT NULL REFERENCES uom(id),
    to_uom_id   BIGINT NOT NULL REFERENCES uom(id),
    factor      NUMERIC(18,6) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_uom_id, to_uom_id)
);

CREATE INDEX idx_warehouses_branch_id ON warehouses(branch_id);
CREATE INDEX idx_warehouses_type ON warehouses(type);
CREATE INDEX idx_uom_conversions_from ON uom_conversions(from_uom_id);
CREATE INDEX idx_uom_conversions_to ON uom_conversions(to_uom_id);