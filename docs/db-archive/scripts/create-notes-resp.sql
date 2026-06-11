-- ============================================================
--  Table : notes_resp
--  Objectif : Notes et observations privées du Responsable RH
--             sur les KPIs de son tableau de bord.
--  Auteur   : HRScope
--  DB       : PostgreSQL (compatible MySQL avec ajustements mineurs)
-- ============================================================

CREATE TABLE IF NOT EXISTS notes_resp (

    -- Identifiant technique
    id              BIGSERIAL           NOT NULL,

    -- Auteur de la note (FK vers users)
    user_id         BIGINT              NOT NULL,
    user_email      VARCHAR(255)        NOT NULL,    -- dénormalisé pour lecture rapide

    -- KPI concerné (NULL pour les notes libres non liées à un KPI)
    kpi_key         VARCHAR(50)         NULL,        -- ex : 'attendance', 'retard', 'absenteisme', 'effectif'
    kpi_label       VARCHAR(120)        NULL,        -- ex : 'Attendance Rate moyen'

    -- Titre optionnel (surtout utile pour les notes libres)
    title           VARCHAR(200)        NULL,

    -- Contenu de la note
    content         TEXT                NOT NULL
                    CONSTRAINT notes_resp_content_nonempty CHECK (TRIM(content) <> ''),

    -- Horodatage
    created_at      TIMESTAMP           NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP           NOT NULL DEFAULT NOW(),

    -- Clés
    CONSTRAINT pk_notes_resp              PRIMARY KEY (id),
    CONSTRAINT fk_notes_resp_user         FOREIGN KEY (user_id)
                                          REFERENCES users (user_id)
                                          ON DELETE CASCADE
                                          ON UPDATE CASCADE
);

-- ── Index ──────────────────────────────────────────────────────
-- Récupération de toutes les notes d'un utilisateur (cas d'usage principal)
CREATE INDEX IF NOT EXISTS idx_notes_resp_user_id
    ON notes_resp (user_id);

-- Filtre par KPI (utilisé sur la page Notes pour filtrer par indicateur)
CREATE INDEX IF NOT EXISTS idx_notes_resp_kpi_key
    ON notes_resp (user_id, kpi_key);

-- Tri chronologique (les notes les plus récentes en premier)
CREATE INDEX IF NOT EXISTS idx_notes_resp_created_desc
    ON notes_resp (user_id, created_at DESC);

-- ── Trigger updated_at (PostgreSQL) ────────────────────────────
-- Maintient automatiquement updated_at à jour à chaque UPDATE.

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notes_resp_updated_at
    BEFORE UPDATE ON notes_resp
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_updated_at();

-- ── Commentaires de colonnes ────────────────────────────────────
COMMENT ON TABLE  notes_resp            IS 'Observations et notes privées du Responsable RH sur les KPIs du dashboard.';
COMMENT ON COLUMN notes_resp.kpi_key    IS 'Clé technique du KPI : effectif | attendance | absenteisme | retard. NULL pour une note libre.';
COMMENT ON COLUMN notes_resp.kpi_label  IS 'Libellé affiché du KPI (dénormalisé pour affichage sans jointure). NULL pour une note libre.';
COMMENT ON COLUMN notes_resp.title      IS 'Titre optionnel de la note — particulièrement utile pour les notes libres non liées à un KPI.';
COMMENT ON COLUMN notes_resp.content    IS 'Corps de la note, texte libre, non vide.';
COMMENT ON COLUMN notes_resp.user_email IS 'Email dénormalisé — évite une jointure sur users pour les lectures fréquentes.';

-- ── Note pour MySQL / MariaDB ───────────────────────────────────
-- Remplacer BIGSERIAL par BIGINT AUTO_INCREMENT
-- Remplacer TIMESTAMP DEFAULT NOW() par DATETIME DEFAULT CURRENT_TIMESTAMP
-- Remplacer ON UPDATE par ON UPDATE CURRENT_TIMESTAMP sur updated_at
-- Le trigger updated_at est inutile (géré nativement par ON UPDATE)
-- Supprimer les blocs CREATE OR REPLACE FUNCTION / CREATE TRIGGER
-- Remplacer TRIM(content) <> '' par LENGTH(TRIM(content)) > 0 dans le CHECK
--
-- Exemple colonne updated_at sous MySQL :
--   updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
