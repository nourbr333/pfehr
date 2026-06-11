-- Ajoute le contexte de filtrage (portée département + période) aux commentaires KPI.
ALTER TABLE notes_resp
    ADD COLUMN IF NOT EXISTS filter_scope VARCHAR(120) NULL,
    ADD COLUMN IF NOT EXISTS period_label VARCHAR(120) NULL;

COMMENT ON COLUMN notes_resp.filter_scope IS 'Portée du filtre au moment du commentaire : nom du département ou « Tous les départements ».';
COMMENT ON COLUMN notes_resp.period_label IS 'Libellé de la période active au moment du commentaire (ex : 01 janv. 2026 – 31 janv. 2026).';
