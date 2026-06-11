-- Prerequis: table users existante.
-- Ce script ajoute uniquement la structure manquante pour brancher le portail admin sur PostgreSQL.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS validated BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at DATE NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    user_id BIGINT NULL REFERENCES users(user_id) ON DELETE SET NULL,
    target_name VARCHAR(255) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    details TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_user_id ON admin_audit_logs(user_id);
