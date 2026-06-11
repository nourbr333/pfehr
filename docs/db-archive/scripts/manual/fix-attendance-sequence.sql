-- Fix: resynchronise the attendance_attendance_id_seq sequence with the actual MAX(attendance_id).
-- Run this once against the database when the sequence has drifted out of sync with existing rows
-- (symptom: "duplicate key value violates unique constraint attendance_pkey" on import).

SELECT setval(
    'attendance_attendance_id_seq',
    COALESCE((SELECT MAX(attendance_id) FROM attendance), 0),
    true   -- "is_called = true" means the NEXT call to nextval returns MAX + 1
);
