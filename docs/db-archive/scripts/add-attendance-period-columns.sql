-- Migration: add period_start and period_end columns to attendance table
-- Enables accumulation of weekly imports instead of overwriting existing data.

ALTER TABLE attendance
    ADD COLUMN IF NOT EXISTS period_start DATE,
    ADD COLUMN IF NOT EXISTS period_end   DATE;

-- Replace old unique constraint (1 row per employee) with new one (1 row per employee+period)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_key;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS uq_attendance_employee;
ALTER TABLE attendance ADD CONSTRAINT attendance_employee_period_uk
    UNIQUE (employee_id, period_start, period_end);
