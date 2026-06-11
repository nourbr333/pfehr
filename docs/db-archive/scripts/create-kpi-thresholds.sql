-- ============================================================
-- KPI Thresholds & Targets
-- Run this script in pgAdmin once to set up the table.
-- For existing installs with user_email, run alter-kpi-thresholds-user-id.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS kpi_thresholds (
    id              BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    kpi_key         VARCHAR(50)  NOT NULL,
    kpi_label       VARCHAR(120),
    period_label    VARCHAR(50),
    threshold_value NUMERIC(8,2),
    target_value    NUMERIC(8,2),
    phrase_officielle TEXT,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_kpi_thresholds_user_kpi UNIQUE (user_id, kpi_key)
);

COMMENT ON TABLE  kpi_thresholds IS 'KPI seuil/cible configurations per RH manager (user_id)';
COMMENT ON COLUMN kpi_thresholds.kpi_key IS 'Allowed keys: attendance | absenteisme | retard';
COMMENT ON COLUMN kpi_thresholds.threshold_value IS 'Seuil d''alerte (%) — breach triggers avertissement notification';
COMMENT ON COLUMN kpi_thresholds.target_value IS 'Objectif cible (%) — achievement triggers performance notification';

CREATE INDEX IF NOT EXISTS idx_kpi_thresholds_user_id ON kpi_thresholds (user_id);
