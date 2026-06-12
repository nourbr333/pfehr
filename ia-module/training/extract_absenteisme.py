"""P1 — Extraction des features du dataset Absentéisme.

Approche par snapshots : pour chaque employé et chaque date de snapshot,
on calcule les features sur la fenêtre d'historique précédente et la variable
cible sur l'horizon suivant (target = 1 si au moins 1 jour d'absence dans les
TARGET_HORIZON_DAYS jours qui suivent le snapshot).

Cela densifie le dataset : 45 employés x N snapshots au lieu d'une seule ligne
par employé, indispensable avec un historique court (~5,5 mois).
"""
from __future__ import annotations

import sys

import pandas as pd
from sqlalchemy import create_engine, text

import config

# Le SQL adapte les fenêtres aux paramètres et au schéma RÉEL :
#   - statuts français : 'approuvee' / 'refusee'
#   - absence_type CHECK : conge-paye / maladie / sans-solde / evenement-familial / autre
#   - le signal d'absence vient de attendance.is_present = false
SQL = text(
    """
WITH bounds AS (
    SELECT MIN(attendance_date) AS min_d, MAX(attendance_date) AS max_d
    FROM attendance
),
snapshots AS (
    SELECT gs::date AS snap
    FROM bounds,
         generate_series(
             min_d + make_interval(days => :hist_days),
             max_d - make_interval(days => :horizon_days),
             make_interval(days => :interval_days)
         ) AS gs
),
emp_snap AS (
    SELECT e.employee_id, s.snap
    FROM employees e
    CROSS JOIN snapshots s
)
SELECT
    es.employee_id,
    es.snap AS snapshot_date,
    COALESCE(a30.taux_absence_30j, 0)                                   AS taux_absence_30j,
    COALESCE(a90.taux_absence_90j, 0)                                   AS taux_absence_90j,
    COALESCE(a30.nb_retards_30j, 0)                                     AS nb_retards_30j,
    COALESCE(a30.overtime_moyen_30j, 0)                                 AS overtime_moyen_30j,
    COALESCE(ab.nb_maladie_12m, 0)                                      AS nb_maladie_12m,
    COALESCE(ab.nb_approuves_12m, 0)                                    AS nb_approuves_12m,
    COALESCE(ab.nb_refus_12m, 0)                                        AS nb_refus_12m,
    COALESCE(dept.dept_taux_absence, 0)                                 AS dept_taux_absence,
    COALESCE(EXTRACT(YEAR FROM age(es.snap, e.hire_date)), 0)           AS anciennete,
    COALESCE(EXTRACT(YEAR FROM age(es.snap, e.date_of_birth)), 0)       AS age,
    CASE WHEN EXISTS (
        SELECT 1 FROM attendance t
        WHERE t.employee_id = es.employee_id
          AND t.is_present = false
          AND t.attendance_date >= es.snap
          AND t.attendance_date < es.snap + make_interval(days => :horizon_days)
    ) THEN 1 ELSE 0 END                                                 AS target_absence
FROM emp_snap es
JOIN employees e ON e.employee_id = es.employee_id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE a.is_present = false)::float
            / NULLIF(COUNT(*), 0)                  AS taux_absence_30j,
        COUNT(*) FILTER (WHERE a.is_late)          AS nb_retards_30j,
        AVG(a.overtime_hours)                      AS overtime_moyen_30j
    FROM attendance a
    WHERE a.employee_id = es.employee_id
      AND a.attendance_date >= es.snap - make_interval(days => 30)
      AND a.attendance_date <  es.snap
) a30 ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE a.is_present = false)::float
            / NULLIF(COUNT(*), 0)                  AS taux_absence_90j
    FROM attendance a
    WHERE a.employee_id = es.employee_id
      AND a.attendance_date >= es.snap - make_interval(days => 90)
      AND a.attendance_date <  es.snap
) a90 ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE r.absence_type = 'maladie')  AS nb_maladie_12m,
        COUNT(*) FILTER (WHERE r.status = 'approuvee')      AS nb_approuves_12m,
        COUNT(*) FILTER (WHERE r.status = 'refusee')        AS nb_refus_12m
    FROM absence_requests r
    WHERE r.employee_id = es.employee_id
      AND r.start_date >= es.snap - make_interval(days => 365)
      AND r.start_date <  es.snap
) ab ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE a.is_present = false)::float
            / NULLIF(COUNT(*), 0)                  AS dept_taux_absence
    FROM attendance a
    JOIN employees e2 ON e2.employee_id = a.employee_id
    WHERE e2.department_id = e.department_id
      AND a.attendance_date >= es.snap - make_interval(days => 30)
      AND a.attendance_date <  es.snap
) dept ON true
ORDER BY es.snap, es.employee_id
"""
)


def extract() -> pd.DataFrame:
    engine = create_engine(config.DB_URL)
    params = {
        "hist_days": config.FEATURE_HISTORY_DAYS,
        "horizon_days": config.TARGET_HORIZON_DAYS,
        "interval_days": config.SNAPSHOT_INTERVAL_DAYS,
    }
    with engine.connect() as conn:
        df = pd.read_sql(SQL, conn, params=params)

    df.fillna(0, inplace=True)
    return df


def main() -> int:
    print("[EXTRACT] Connexion à la base et extraction des features Absentéisme...")
    try:
        df = extract()
    except Exception as exc:  # noqa: BLE001
        print(f"[EXTRACT] ERREUR : {exc}")
        return 1

    if df.empty:
        print("[EXTRACT] Dataset VIDE — historique insuffisant pour générer des snapshots.")
        return 1

    n = len(df)
    pos = int(df[config.ABSENTEISME_TARGET].sum())
    n_snap = df["snapshot_date"].nunique()
    n_emp = df["employee_id"].nunique()

    df.to_csv(config.ABSENTEISME_DATASET_CSV, index=False)

    print("─" * 60)
    print(f"[EXTRACT] Dataset           : {n} lignes")
    print(f"[EXTRACT] Snapshots         : {n_snap}  ({', '.join(str(d) for d in sorted(df['snapshot_date'].unique()))})")
    print(f"[EXTRACT] Employés          : {n_emp}")
    print(f"[EXTRACT] Target=1 (absent) : {pos}  ({pos / n:.1%})")
    print(f"[EXTRACT] Target=0          : {n - pos}  ({(n - pos) / n:.1%})")
    print(f"[EXTRACT] Fichier sauvé     : {config.ABSENTEISME_DATASET_CSV}")
    print("─" * 60)
    print("\nAperçu (5 premières lignes) :")
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(df.head().to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
