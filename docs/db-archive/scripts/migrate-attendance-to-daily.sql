-- ============================================================
-- Migration : attendance table → enregistrements journaliers
-- 1 ligne = 1 employé × 1 jour (suppression des agrégats mensuels)
-- À exécuter APRÈS avoir vidé la table (TRUNCATE attendance).
-- ============================================================

-- 1. Vider la table (données obsolètes de l'ancien schéma)
TRUNCATE attendance;

-- 2. Supprimer les colonnes d'agrégat mensuel (si elles existent encore)
ALTER TABLE attendance
  DROP COLUMN IF EXISTS attendance_rate,
  DROP COLUMN IF EXISTS absences_days,
  DROP COLUMN IF EXISTS late_days,
  DROP COLUMN IF EXISTS period_start,
  DROP COLUMN IF EXISTS period_end;

-- 3. Ajouter les colonnes journalières (IF NOT EXISTS = idempotent)
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS attendance_date DATE             NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS is_present      BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_late         BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_hours  DOUBLE PRECISION          DEFAULT 0.0;

-- 4. Retirer les DEFAULT temporaires
ALTER TABLE attendance
  ALTER COLUMN attendance_date DROP DEFAULT,
  ALTER COLUMN is_present      DROP DEFAULT,
  ALTER COLUMN is_late         DROP DEFAULT;

-- 5. Contrainte d'unicité (ignore si déjà présente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_attendance_daily'
  ) THEN
    ALTER TABLE attendance
      ADD CONSTRAINT uq_attendance_daily UNIQUE (employee_id, attendance_date);
  END IF;
END$$;

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date
  ON attendance(employee_id, attendance_date);
