ALTER TABLE notes_resp
    ALTER COLUMN kpi_key  DROP NOT NULL,
    ALTER COLUMN kpi_label DROP NOT NULL;

ALTER TABLE notes_resp
    ADD COLUMN IF NOT EXISTS title VARCHAR(200) NULL;

COMMENT ON COLUMN notes_resp.kpi_key   IS 'Clé technique du KPI : effectif | attendance | absenteisme | retard. NULL pour une note libre.';
COMMENT ON COLUMN notes_resp.kpi_label IS 'Libellé affiché du KPI (dénormalisé). NULL pour une note libre.';
COMMENT ON COLUMN notes_resp.title     IS 'Titre optionnel — utile pour les notes libres non liées à un KPI.';
