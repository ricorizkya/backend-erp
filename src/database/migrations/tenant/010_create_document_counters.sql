-- ============================================================
-- DOCUMENT COUNTERS SCHEMA
-- Dipakai oleh DocumentNumberService untuk atomic numbering
-- ============================================================

CREATE TABLE IF NOT EXISTS document_counters (
    doc_type    VARCHAR(10)  NOT NULL,
    year        INTEGER      NOT NULL,
    counter     INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (doc_type, year)
);
