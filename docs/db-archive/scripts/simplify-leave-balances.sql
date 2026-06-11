-- ============================================================
-- MIGRATION : Simplification des soldes congés (droit tunisien)
--
-- Seul le congé payé (18j/an) génère un solde réel.
-- • maladie / sans-solde : motifs d'absence uniquement,
--   pas de solde prédéfini → désactivés dans leave_policies.
-- • evenement-familial   : jours fixes par événement (mariage 4j,
--   naissance 2j, décès 3j) → pas un solde cumulable.
--
-- NB : la table absence_requests / leave_requests reste INCHANGÉE.
-- Les employés peuvent toujours déposer une demande de type
-- 'maladie', 'sans-solde', 'evenement-familial' — seul le suivi
-- d'un « solde » pour ces types est supprimé.
-- ============================================================

-- 1. Supprimer toutes les lignes leave_balances qui ne sont pas conge-paye
DELETE FROM leave_balance_adjustments
WHERE balance_id IN (SELECT id FROM leave_balances WHERE type != 'conge-paye');

DELETE FROM leave_balances WHERE type != 'conge-paye';

-- 2. Remplacer la contrainte CHECK pour n'accepter que conge-paye
ALTER TABLE leave_balances
    DROP CONSTRAINT IF EXISTS leave_balances_type_check;

ALTER TABLE leave_balances
    ADD CONSTRAINT leave_balances_type_check CHECK (type = 'conge-paye');

-- 3. Fixer entitled à 18 jours là où c'est encore à 0
UPDATE leave_balances SET entitled = 18 WHERE entitled = 0;

-- 4. Rafraîchir la vue calculée
CREATE OR REPLACE VIEW leave_balances_view AS
SELECT
    lb.*,
    GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) AS remaining,
    CASE
        WHEN GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) < 5  THEN 'critical'
        WHEN GREATEST(0, lb.entitled + lb.carry_over - lb.used - lb.pending) < 10 THEN 'warning'
        ELSE 'ok'
    END AS balance_status
FROM leave_balances lb;

-- 5. Désactiver maladie et sans-solde dans les politiques
--    (ils restent utilisables comme motifs dans absence_requests / leave_requests)
UPDATE leave_policies
SET is_active = FALSE
WHERE type IN ('maladie', 'sans-solde');

-- 6. Evenement-familial : pas de report, pas d'auto-approbation
UPDATE leave_policies
SET max_carry_over_days = 0,
    auto_approve_below  = NULL
WHERE type = 'evenement-familial';
