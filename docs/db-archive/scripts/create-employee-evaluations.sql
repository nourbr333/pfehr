-- Exécuter une fois sur hr_database (PostgreSQL) si la table n'existe pas encore.
-- Stocke les évaluations réalisées par un manager pour un employé.

CREATE TABLE IF NOT EXISTS employee_evaluations (
    evaluation_id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees (employee_id),
    manager_id INTEGER NOT NULL,
    evaluated_at DATE NOT NULL DEFAULT CURRENT_DATE,
    period VARCHAR(50),
    objectif VARCHAR(255),
    comments TEXT,
    rating INTEGER
);

CREATE INDEX IF NOT EXISTS idx_employee_evaluations_employee_id
    ON employee_evaluations (employee_id);

#collé déja. 