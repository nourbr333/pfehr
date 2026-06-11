-- ============================================================
-- MIGRATION : add recipient_id to notifications
-- Allows targeted notifications (per user) alongside broadcast
-- (recipient_id IS NULL = visible to all authenticated users).
-- ============================================================

-- 1. Add column (nullable = backward-compatible, NULL = broadcast)
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS recipient_id BIGINT REFERENCES users(user_id);

-- 2. Drop old single-table UNIQUE constraint (conflicts with dual-index strategy)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'notifications_unique_source'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_unique_source;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_notifications_source'
          AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT uq_notifications_source;
    END IF;
END$$;

-- 3. Partial unique index for broadcast rows (recipient_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_broadcast
    ON notifications (source_table, source_id, type)
    WHERE recipient_id IS NULL;

-- 4. Partial unique index for targeted rows (per recipient)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_targeted
    ON notifications (source_table, source_id, type, recipient_id)
    WHERE recipient_id IS NOT NULL;

-- 5. Index for fast lookup by recipient
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id
    ON notifications (recipient_id);
