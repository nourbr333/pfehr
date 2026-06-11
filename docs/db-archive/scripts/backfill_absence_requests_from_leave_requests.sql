-- Backfill absence_requests from existing leave_requests that were created before the sync fix.
-- Run this once against the database after deploying the LeaveRequestService fix.
-- It is safe to re-run (WHERE NOT EXISTS prevents duplicates).

INSERT INTO absence_requests (
    employee_id,
    manager_id,
    absence_type,
    status,
    start_date,
    end_date,
    reason,
    requested_at,
    decided_at,
    continuity_required
)
SELECT
    lr.employee_id,
    COALESCE(e.manager_id, lr.employee_id) AS manager_id,
    CASE
        WHEN LOWER(lr.type) = 'maladie'             THEN 'maladie'
        WHEN LOWER(lr.type) = 'sans-solde'          THEN 'sans-solde'
        WHEN LOWER(lr.type) = 'evenement-familial'  THEN 'evenement-familial'
        WHEN LOWER(lr.type) = 'autre'               THEN 'autre'
        ELSE 'conge-paye'
    END AS absence_type,
    CASE
        WHEN lr.status = 'approved'                  THEN 'approuvee'
        WHEN lr.status IN ('rejected','cancelled')   THEN 'refusee'
        ELSE 'en_attente'
    END AS status,
    lr.start_date,
    lr.end_date,
    COALESCE(lr.notes, '') AS reason,
    COALESCE(lr.requested_at, NOW()) AS requested_at,
    lr.reviewed_at AS decided_at,
    false AS continuity_required
FROM leave_requests lr
JOIN employees e ON e.employee_id = lr.employee_id
WHERE
    -- Only sync if the employee has a manager (otherwise no manager portal to show it in)
    COALESCE(e.manager_id, lr.employee_id) IS NOT NULL
    -- Skip rows already present in absence_requests
    AND NOT EXISTS (
        SELECT 1
        FROM absence_requests ar
        WHERE ar.employee_id = lr.employee_id
          AND ar.start_date  = lr.start_date
          AND ar.end_date    = lr.end_date
    );
