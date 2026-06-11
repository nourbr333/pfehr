-- ============================================================
-- TABLE : leave_balances
-- Soldes de congés par employé, type et année
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_balances (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL,
    type            VARCHAR(50) NOT NULL
                      CHECK (type IN ('conge-paye','maladie','sans-solde','evenement-familial','autre')),
    year            INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
    entitled        NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (entitled >= 0),
    used            NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (used >= 0),
    pending         NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (pending >= 0),
    carry_over      NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (carry_over >= 0),
    expires_at      DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT leave_balances_unique UNIQUE (employee_id, type, year),
    CONSTRAINT leave_balances_used_lte_entitled
        CHECK (used <= entitled + carry_over + 5)
);

-- Vue calculée : remaining
CREATE OR REPLACE VIEW leave_balances_view AS
SELECT
    lb.*,
    GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) AS remaining,
    CASE
        WHEN GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) < 5  THEN 'critical'
        WHEN GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) < 10 THEN 'warning'
        ELSE 'ok'
    END AS balance_status
FROM leave_balances lb;

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_id ON leave_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year        ON leave_balances(year);
CREATE INDEX IF NOT EXISTS idx_leave_balances_type        ON leave_balances(type);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leave_balances_updated_at'
    ) THEN
        CREATE TRIGGER trg_leave_balances_updated_at
        BEFORE UPDATE ON leave_balances
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Table d'audit des ajustements manuels
CREATE TABLE IF NOT EXISTS leave_balance_adjustments (
    id              SERIAL PRIMARY KEY,
    balance_id      INTEGER NOT NULL REFERENCES leave_balances(id) ON DELETE CASCADE,
    adjustment      NUMERIC(5,1) NOT NULL,
    reason          TEXT NOT NULL,
    adjusted_by     INTEGER,
    adjusted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
