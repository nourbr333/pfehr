-- Migration: ajouter la colonne is_manager à la table employees
-- Permet de distinguer les employés qui sont managers sans dépendre uniquement
-- de la présence de subordonnés (managerId d'autres employés pointant vers eux).

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT FALSE;

-- Rétro-remplissage : tout employé dont l'employee_id apparaît comme manager_id
-- d'au moins un autre employé est marqué is_manager = true.
UPDATE employees e
SET is_manager = TRUE
WHERE EXISTS (
    SELECT 1 FROM employees sub WHERE sub.manager_id = e.employee_id
);
