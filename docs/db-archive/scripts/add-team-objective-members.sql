-- Join table: one team_objective can have multiple owner/member employees.
-- Allows TEAM-scope objectives to track multiple proprietaires in a normalized way.

CREATE TABLE IF NOT EXISTS team_objective_members (
    id              BIGSERIAL PRIMARY KEY,
    objective_id    BIGINT  NOT NULL REFERENCES team_objectives (objective_id) ON DELETE CASCADE,
    employee_id     INTEGER NOT NULL REFERENCES employees (employee_id),
    UNIQUE (objective_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_team_objective_members_objective
    ON team_objective_members (objective_id);
