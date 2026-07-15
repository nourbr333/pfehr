-- Ajoute les colonnes nécessaires au CRUD complet des départements
-- (description, statut actif/inactif, horodatage) ainsi qu'une contrainte
-- d'unicité sur le nom. Idempotent : peut être exécuté plusieurs fois sans erreur
-- (utile car il est aussi exécuté manuellement en amont, avant d'être repris par Flyway).

ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_at  TIMESTAMP NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_departments_name'
    ) THEN
        ALTER TABLE departments ADD CONSTRAINT uq_departments_name UNIQUE (department_name);
    END IF;
END $$;
