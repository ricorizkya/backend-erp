CREATE TABLE IF NOT EXISTS product_categories (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    parent_id   BIGINT REFERENCES product_categories(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attributes (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attribute_values (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attribute_id    BIGINT NOT NULL REFERENCES attributes(id),
    value           VARCHAR(100) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id         BIGINT REFERENCES product_categories(id),
    code                VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    base_uom_id         BIGINT NOT NULL REFERENCES uom(id),
    purchase_uom_id     BIGINT NOT NULL REFERENCES uom(id),
    sales_uom_id        BIGINT NOT NULL REFERENCES uom(id),
    can_be_purchased    BOOLEAN DEFAULT true,
    can_be_sold         BOOLEAN DEFAULT true,
    can_be_manufactured BOOLEAN DEFAULT false,
    has_variant         BOOLEAN DEFAULT false,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES products(id),
    sku         VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(255),
    cost_price  NUMERIC(18,4) DEFAULT 0,
    sale_price  NUMERIC(18,4) DEFAULT 0,
    min_stock   NUMERIC(18,4) DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variant_attributes (
    variant_id          BIGINT REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_value_id  BIGINT REFERENCES attribute_values(id),
    PRIMARY KEY (variant_id, attribute_value_id)
);

CREATE TABLE IF NOT EXISTS batches (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    variant_id          BIGINT NOT NULL REFERENCES product_variants(id),
    batch_number        VARCHAR(100) NOT NULL,
    manufacture_date    DATE,
    expiry_date         DATE,
    origin              VARCHAR(255),
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(variant_id, batch_number)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    contact_person  VARCHAR(255),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    address         TEXT,
    city            VARCHAR(100),
    npwp            VARCHAR(50),
    payment_term    INTEGER DEFAULT 30,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code            VARCHAR(100) UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    contact_person  VARCHAR(255),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    address         TEXT,
    city            VARCHAR(100),
    npwp            VARCHAR(50),
    credit_limit    NUMERIC(18,4) DEFAULT 0,
    payment_term    INTEGER DEFAULT 30,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_products_category_id 
    ON products(category_id);
CREATE INDEX idx_products_is_active 
    ON products(is_active) WHERE is_active = true;
CREATE INDEX idx_products_flags 
    ON products(can_be_purchased, can_be_sold, can_be_manufactured);
CREATE INDEX idx_product_variants_product_id 
    ON product_variants(product_id);
CREATE INDEX idx_product_variants_is_active 
    ON product_variants(is_active) WHERE is_active = true;
CREATE INDEX idx_attribute_values_attribute_id 
    ON attribute_values(attribute_id);
CREATE INDEX idx_batches_variant_id 
    ON batches(variant_id);
CREATE INDEX idx_batches_batch_number 
    ON batches(batch_number);
CREATE INDEX idx_suppliers_is_active 
    ON suppliers(is_active) WHERE is_active = true;
CREATE INDEX idx_customers_is_active 
    ON customers(is_active) WHERE is_active = true;