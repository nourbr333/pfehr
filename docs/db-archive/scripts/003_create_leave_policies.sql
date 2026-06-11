-- ============================================================
-- TABLE : leave_policies
-- Configuration des règles par type de congé
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_policies (
    id                      SERIAL PRIMARY KEY,
    type                    VARCHAR(50) NOT NULL UNIQUE
                              CHECK (type IN ('conge-paye','maladie','sans-solde','evenement-familial','autre')),
    label                   VARCHAR(100) NOT NULL,
    max_days_per_year       INTEGER NOT NULL CHECK (max_days_per_year > 0),
    requires_document       BOOLEAN NOT NULL DEFAULT FALSE,
    min_notice_days         INTEGER NOT NULL DEFAULT 0 CHECK (min_notice_days >= 0),
    auto_approve_below      INTEGER CHECK (auto_approve_below > 0),
    max_carry_over_days     INTEGER NOT NULL DEFAULT 0 CHECK (max_carry_over_days >= 0),
    color                   VARCHAR(7) NOT NULL DEFAULT '#2563eb',
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_policies_updated_at'
    ) THEN
        CREATE TRIGGER trg_leave_policies_updated_at
        BEFORE UPDATE ON leave_policies
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
