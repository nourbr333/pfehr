-- Migration: ajouter la colonne kpi_value à la table notes_resp
-- Permet de capturer la valeur/mesure du KPI au moment où le commentaire est rédigé
-- (ex: "87.3%", "4.2/5", "12 absences") afin de contextualiser la note dans le temps.

ALTER TABLE notes_resp
    ADD COLUMN IF NOT EXISTS kpi_value VARCHAR(255) NULL;
