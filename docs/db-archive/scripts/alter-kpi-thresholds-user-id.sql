-- ============================================================
-- MIGRATION : kpi_thresholds.user_email → user_id (FK users)
-- Run after create-kpi-thresholds.sql and create-users-auth.sql
-- ============================================================

-- 1. Remove orphan / deprecated KPI keys
DELETE FROM kpi_thresholds
WHERE kpi_key IN (
    'effectif',
    'chart.dept', 'chart.age', 'chart.genre',
    'chart.presence.dept', 'chart.retard.dept', 'chart.evaluations',
    'chart.okr.completion', 'chart.okr.status', 'chart.okr.heatmap',
    'chart.seniority.dist', 'chart.seniority.dept', 'chart.seniority.genre'
);

-- 2. Add user_id column
ALTER TABLE kpi_thresholds
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(user_id);

-- 3. Backfill from user_email
UPDATE kpi_thresholds kt
SET user_id = u.user_id
FROM users u
WHERE kt.user_id IS NULL
  AND LOWER(TRIM(kt.user_email)) = LOWER(TRIM(u.email));

-- 4. Drop rows that could not be matched
DELETE FROM kpi_thresholds WHERE user_id IS NULL;

-- 5. Enforce NOT NULL + swap unique constraint
ALTER TABLE kpi_thresholds ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE kpi_thresholds DROP CONSTRAINT IF EXISTS uq_kpi_thresholds_user_kpi;
ALTER TABLE kpi_thresholds
    ADD CONSTRAINT uq_kpi_thresholds_user_kpi UNIQUE (user_id, kpi_key);

-- 6. Replace email index with user_id index
DROP INDEX IF EXISTS idx_kpi_thresholds_user_email;
CREATE INDEX IF NOT EXISTS idx_kpi_thresholds_user_id ON kpi_thresholds (user_id);

-- 7. Drop legacy email column
ALTER TABLE kpi_thresholds DROP COLUMN IF EXISTS user_email;

COMMENT ON COLUMN kpi_thresholds.user_id IS 'Responsable RH owner — FK users(user_id)';
COMMENT ON COLUMN kpi_thresholds.kpi_key IS 'Allowed: attendance | absenteisme | retard';
