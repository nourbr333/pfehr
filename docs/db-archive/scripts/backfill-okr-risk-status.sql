-- Recalcule risk_status, risk_reason et delay_days pour tous les objectifs existants.
-- Aligné sur ObjectiveRiskCalculator (progression vs rythme attendu + échéance).
-- Exécuter une fois après déploiement de l'auto-calcul du risque.

BEGIN;

WITH calc AS (
    SELECT
        o.objective_id,
        o.due_date,
        o.progress_percent::float AS progress_percent,
        o.created_at::date AS start_date,
        CURRENT_DATE AS today,
        GREATEST(0, CURRENT_DATE - o.due_date) AS delay_days,
        CASE
            WHEN o.progress_percent >= 100 THEN 100.0
            WHEN o.due_date IS NULL OR o.created_at IS NULL THEN 100.0
            WHEN (o.due_date - o.created_at::date) <= 0 THEN 100.0
            ELSE LEAST(
                100.0,
                GREATEST(
                    0.0,
                    (CURRENT_DATE - o.created_at::date)::float
                        / NULLIF((o.due_date - o.created_at::date), 0)
                        * 100.0
                )
            )
        END AS expected_progress
    FROM team_objectives o
),
labeled AS (
    SELECT
        c.*,
        CASE
            WHEN c.progress_percent >= 100 THEN 'ON_TRACK'
            WHEN c.today > c.due_date THEN 'OFF_TRACK'
            WHEN c.progress_percent >= c.expected_progress - 10 THEN 'ON_TRACK'
            WHEN c.progress_percent >= c.expected_progress - 25 THEN 'AT_RISK'
            ELSE 'OFF_TRACK'
        END AS new_status,
        CASE
            WHEN c.progress_percent >= 100 THEN 'Objectif atteint à 100%.'
            WHEN c.today > c.due_date THEN
                'Échéance dépassée de ' || c.delay_days || ' jour(s) — progression '
                || ROUND(c.progress_percent::numeric, 0) || '%.'
            ELSE
                'Progression ' || ROUND(c.progress_percent::numeric, 0)
                || '% vs ' || ROUND(c.expected_progress::numeric, 0) || '% attendus'
                || CASE
                    WHEN c.due_date > c.today
                        THEN ' (J-' || (c.due_date - c.today) || ').'
                    ELSE '.'
                   END
        END AS new_reason
    FROM calc c
)
UPDATE team_objectives o
SET
    delay_days = l.delay_days,
    risk_status = l.new_status,
    risk_reason = l.new_reason,
    updated_at = NOW()
FROM labeled l
WHERE o.objective_id = l.objective_id;

COMMIT;
