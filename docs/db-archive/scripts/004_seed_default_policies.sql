-- ============================================================
-- SEED : Politiques par défaut (insert uniquement si absent)
-- ============================================================
INSERT INTO leave_policies (type, label, max_days_per_year, requires_document, min_notice_days, auto_approve_below, max_carry_over_days, color)
VALUES
    ('conge-paye',         'Congé payé annuel',   22, FALSE, 7,  2, 5, '#2563eb'),
    ('maladie',            'Congé maladie',        60, TRUE,  0,  2, 0, '#f59e0b'),
    ('sans-solde',         'Congé sans solde',     30, FALSE, 14, NULL, 0, '#6b7280'),
    ('evenement-familial', 'Événement familial',   10, TRUE,  1,  3, 0, '#8b5cf6'),
    ('autre',              'Autre absence',        15, FALSE, 3,  1, 0, '#9ca3af')
ON CONFLICT (type) DO NOTHING;

-- ============================================================
-- SEED : Soldes initiaux pour l'année courante
-- ============================================================
DO $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
BEGIN
    INSERT INTO leave_balances (employee_id, type, year, entitled, carry_over)
    SELECT
        e.employee_id,
        p.type,
        current_year,
        p.max_days_per_year,
        0
    FROM employees e
    CROSS JOIN leave_policies p
    WHERE p.is_active = TRUE
    ON CONFLICT (employee_id, type, year) DO NOTHING;
END $$;
