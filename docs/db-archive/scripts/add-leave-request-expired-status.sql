-- ============================================================
-- MIGRATION : ajout du statut 'expired' (arrivé à échéance)
--             dans la table leave_requests
-- ============================================================

-- 1. Supprimer l'ancienne contrainte CHECK sur la colonne status
--    (PostgreSQL nomme automatiquement les contraintes inline
--     leave_requests_status_check)
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'leave_requests'::regclass
      AND contype   = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%pending%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%expired%'
  LOOP
    EXECUTE 'ALTER TABLE leave_requests DROP CONSTRAINT ' || quote_ident(cname);
  END LOOP;
END $$;

-- 2. Ajouter la nouvelle contrainte avec 'expired'
ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
    CHECK (status IN ('draft','pending','approved','rejected','cancelled','expired'));

-- 3. Index partiel sur les demandes expirées pour les requêtes du scheduler
CREATE INDEX IF NOT EXISTS idx_leave_requests_expired
  ON leave_requests(start_date)
  WHERE status = 'expired';
