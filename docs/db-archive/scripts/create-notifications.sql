-- ============================================================
-- TABLE : notifications
-- Notifications générées à partir des données réelles :
--   leave_requests, employees, events, attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id           SERIAL PRIMARY KEY,
    type         VARCHAR(40)  NOT NULL,
    title        VARCHAR(200) NOT NULL,
    message      TEXT         NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
    source_table VARCHAR(60),
    source_id    BIGINT,
    CONSTRAINT notifications_unique_source UNIQUE (source_table, source_id, type)
);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
