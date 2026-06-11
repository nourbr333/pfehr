-- ============================================================
-- TABLE : leave_requests
-- Demandes de congés soumises par les employés
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id                  SERIAL PRIMARY KEY,
    employee_id         INTEGER NOT NULL,
    type                VARCHAR(50) NOT NULL
                          CHECK (type IN ('conge-paye','maladie','sans-solde','evenement-familial','autre')),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    requested_days      INTEGER NOT NULL CHECK (requested_days > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
    notes               TEXT,
    rejection_reason    TEXT,
    conflicts_detected  BOOLEAN NOT NULL DEFAULT FALSE,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by         INTEGER,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT leave_requests_end_gte_start CHECK (end_date >= start_date),
    CONSTRAINT leave_requests_rejection_reason_required
        CHECK (status != 'rejected' OR rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id  ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status       ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates        ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_type         ON leave_requests(type);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_requests_updated_at'
    ) THEN
        CREATE TRIGGER trg_leave_requests_updated_at
        BEFORE UPDATE ON leave_requests
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Table d'audit des changements de statut
CREATE TABLE IF NOT EXISTS leave_request_audit (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    old_status      VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_by      INTEGER,
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_request_audit_request_id ON leave_request_audit(request_id);
