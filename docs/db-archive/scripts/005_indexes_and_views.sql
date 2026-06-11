-- ============================================================
-- VUE : Récapitulatif complet par demande (enrichie)
-- ============================================================
CREATE OR REPLACE VIEW leave_requests_enriched AS
SELECT
    lr.*,
    lbv.entitled,
    lbv.used,
    lbv.pending,
    lbv.remaining,
    lbv.balance_status,
    lp.requires_document,
    lp.color AS type_color,
    (lr.start_date - CURRENT_DATE) AS days_until_start
FROM leave_requests lr
LEFT JOIN leave_balances_view lbv
    ON lbv.employee_id = lr.employee_id
    AND lbv.type = lr.type
    AND lbv.year = EXTRACT(YEAR FROM lr.start_date)::INTEGER
LEFT JOIN leave_policies lp
    ON lp.type = lr.type;

-- ============================================================
-- VUE : Bradford scores par employé (364 jours glissants, seuils standards 50/175/400)
-- ============================================================
CREATE OR REPLACE VIEW bradford_scores AS
WITH absence_episodes AS (
    SELECT
        employee_id,
        COUNT(*) AS s,
        SUM(requested_days) AS d
    FROM leave_requests
    WHERE status = 'approved'
      AND start_date >= CURRENT_DATE - INTERVAL '364 days'
    GROUP BY employee_id
)
SELECT
    employee_id,
    s AS occurrences,
    d AS total_days,
    (s * s * d) AS bradford_score,
    CASE
        WHEN (s * s * d) >= 400 THEN 'critical'
        WHEN (s * s * d) >= 175 THEN 'high'
        WHEN (s * s * d) >= 50  THEN 'medium'
        ELSE 'low'
    END AS risk_level
FROM absence_episodes;
