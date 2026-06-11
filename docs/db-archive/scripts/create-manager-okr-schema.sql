-- PostgreSQL schema pour la page Manager "Objectifs & OKR"
-- A executer une fois sur hr_database.

CREATE TABLE IF NOT EXISTS team_objectives (
    objective_id BIGSERIAL PRIMARY KEY,
    objective_code VARCHAR(40) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    objective_scope VARCHAR(20) NOT NULL CHECK (objective_scope IN ('TEAM', 'INDIVIDUAL')),
    owner_employee_id INTEGER NOT NULL REFERENCES employees (employee_id),
    manager_employee_id INTEGER NOT NULL REFERENCES employees (employee_id),
    horizon_label VARCHAR(50) NOT NULL,
    due_date DATE NOT NULL,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    risk_status VARCHAR(20) NOT NULL CHECK (risk_status IN ('ON_TRACK', 'AT_RISK', 'OFF_TRACK')),
    risk_reason TEXT,
    weighting NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (weighting > 0),
    delay_days INTEGER NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
    last_update_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objective_dependencies (
    dependency_id BIGSERIAL PRIMARY KEY,
    objective_id BIGINT NOT NULL REFERENCES team_objectives (objective_id) ON DELETE CASCADE,
    blocking_source VARCHAR(255) NOT NULL,
    blocking_team VARCHAR(120),
    blocking_status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (blocking_status IN ('OPEN', 'RESOLVED')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS objective_milestones (
    milestone_id BIGSERIAL PRIMARY KEY,
    objective_id BIGINT NOT NULL REFERENCES team_objectives (objective_id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    planned_date DATE NOT NULL,
    actual_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'MISSED')),
    variance_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objective_progress_updates (
    update_id BIGSERIAL PRIMARY KEY,
    objective_id BIGINT NOT NULL REFERENCES team_objectives (objective_id) ON DELETE CASCADE,
    author_employee_id INTEGER NOT NULL REFERENCES employees (employee_id),
    progress_percent NUMERIC(5,2) NOT NULL CHECK (progress_percent >= 0 AND progress_percent <= 100),
    comment_text TEXT,
    risk_status VARCHAR(20) CHECK (risk_status IN ('ON_TRACK', 'AT_RISK', 'OFF_TRACK')),
    risk_reason TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objective_action_plans (
    action_plan_id BIGSERIAL PRIMARY KEY,
    objective_id BIGINT NOT NULL REFERENCES team_objectives (objective_id) ON DELETE CASCADE,
    action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('REPLAN', 'ESCALATE', 'CAPACITY_REINFORCEMENT')),
    title VARCHAR(255) NOT NULL,
    details TEXT,
    owner_employee_id INTEGER REFERENCES employees (employee_id),
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_objectives_manager_due
    ON team_objectives (manager_employee_id, due_date);

CREATE INDEX IF NOT EXISTS idx_team_objectives_risk
    ON team_objectives (risk_status);

CREATE INDEX IF NOT EXISTS idx_objective_dependencies_objective
    ON objective_dependencies (objective_id, blocking_status);

CREATE INDEX IF NOT EXISTS idx_objective_milestones_objective
    ON objective_milestones (objective_id, planned_date);

CREATE INDEX IF NOT EXISTS idx_objective_updates_objective
    ON objective_progress_updates (objective_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_objective_action_plans_objective
    ON objective_action_plans (objective_id, status);
