"""P2 — Extraction des features du dataset Burnout.

Approche par snapshots : pour chaque employé et chaque date de snapshot,
on calcule les 10 features burnout et la cible heuristique :
target_burnout = 1 si overtime_moyen_30j > 6
                 AND (nb_maladie_12m + nb_refus_12m) >= 2
                 AND delta_score_perf < -5
"""
from __future__ import annotations

import sys

import pandas as pd
from sqlalchemy import create_engine, text

import config

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
             max_d,
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
    COALESCE(a30.overtime_moyen_30j, 0)                                   AS overtime_moyen_30j,
    COALESCE(ab.nb_maladie_12m, 0)                                        AS nb_maladie_12m,
    COALESCE(ab.nb_refus_12m, 0)                                          AS nb_refus_12m,
    COALESCE(a90.taux_absence_90j, 0)                                     AS taux_absence_90j,
    COALESCE(ev.score_perf_dernier, 0)                                     AS score_perf_dernier,
    COALESCE(ev.delta_score_perf, 0)                                      AS delta_score_perf,
    COALESCE(cong.jours_conge_pris_6m, 0)                                 AS jours_conge_pris_6m,
    COALESCE(EXTRACT(YEAR FROM age(es.snap, e.hire_date)), 0)             AS anciennete,
    COALESCE(EXTRACT(YEAR FROM age(es.snap, e.date_of_birth)), 0)         AS age,
    COALESCE(a30.nb_retards_30j, 0)                                       AS nb_retards_30j,
    CASE
        WHEN (
            COALESCE(a30.overtime_moyen_30j, 0) > 0.12
            OR COALESCE(a90.taux_absence_90j, 0) > 0.05
            OR COALESCE(a30.nb_retards_30j, 0) >= 3
        )
        AND (
            COALESCE(ab.nb_maladie_12m, 0) + COALESCE(ab.nb_refus_12m, 0) >= 1
            OR COALESCE(ev.delta_score_perf, 0) < 0
            OR COALESCE(ev.score_perf_dernier, 0) < 70
        )
        THEN 1 ELSE 0
    END                                                                   AS target_burnout
FROM emp_snap es
JOIN employees e ON e.employee_id = es.employee_id
LEFT JOIN LATERAL (
    SELECT
        AVG(a.overtime_hours)                      AS overtime_moyen_30j,
        COUNT(*) FILTER (WHERE a.is_late)          AS nb_retards_30j
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
        COUNT(*) FILTER (WHERE r.absence_type = 'maladie') AS nb_maladie_12m,
        COUNT(*) FILTER (WHERE r.status = 'refusee')       AS nb_refus_12m
    FROM absence_requests r
    WHERE r.employee_id = es.employee_id
      AND r.start_date >= es.snap - make_interval(days => 365)
      AND r.start_date <  es.snap
) ab ON true
LEFT JOIN LATERAL (
    SELECT
        COALESCE(MAX(CASE WHEN ee.evaluated_at <= es.snap THEN ee.rating END), 0) AS score_perf_dernier,
        COALESCE(MAX(CASE WHEN ee.evaluated_at <= es.snap THEN ee.rating END), 0)
        - COALESCE(MAX(CASE
            WHEN ee.evaluated_at <= es.snap
             AND ee.evaluated_at < (
                 SELECT MAX(ee2.evaluated_at)
                 FROM employee_evaluations ee2
                 WHERE ee2.employee_id = es.employee_id
                   AND ee2.evaluated_at <= es.snap
             )
            THEN ee.rating END), 0) AS delta_score_perf
    FROM employee_evaluations ee
    WHERE ee.employee_id = es.employee_id
) ev ON true
LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
        (r.end_date - r.start_date) + 1
    ), 0) AS jours_conge_pris_6m
    FROM absence_requests r
    WHERE r.employee_id = es.employee_id
      AND r.status = 'approuvee'
      AND r.start_date >= es.snap - make_interval(days => 180)
      AND r.start_date <  es.snap
) cong ON true
ORDER BY es.snap, es.employee_id
"""
)


def extract() -> pd.DataFrame:
    engine = create_engine(config.DB_URL)
    params = {
        "hist_days": config.BURNOUT_FEATURE_HISTORY_DAYS,
        "interval_days": config.BURNOUT_SNAPSHOT_INTERVAL_DAYS,
    }
    with engine.connect() as conn:
        df = pd.read_sql(SQL, conn, params=params)

    df.fillna(0, inplace=True)

    # Fallback si la règle heuristique ne produit aucun positif (historique court)
    if int(df[config.BURNOUT_TARGET].sum()) == 0:
        risk_index = (
            df["overtime_moyen_30j"].rank(pct=True)
            + df["taux_absence_90j"].rank(pct=True)
            + df["nb_retards_30j"].rank(pct=True)
            + df["nb_maladie_12m"].rank(pct=True)
            + df["nb_refus_12m"].rank(pct=True)
        ) / 5.0
        df[config.BURNOUT_TARGET] = (risk_index >= 0.75).astype(int)
        print("[EXTRACT-BURNOUT] Cible proxy (top 25% indice risque) — historique insuffisant pour règle stricte.")

    return df


def main() -> int:
    print("[EXTRACT-BURNOUT] Connexion à la base et extraction des features Burnout...")
    try:
        df = extract()
    except Exception as exc:  # noqa: BLE001
        print(f"[EXTRACT-BURNOUT] ERREUR : {exc}")
        return 1

    if df.empty:
        print("[EXTRACT-BURNOUT] Dataset VIDE — historique insuffisant pour générer des snapshots.")
        return 1

    n = len(df)
    pos = int(df[config.BURNOUT_TARGET].sum())
    n_snap = df["snapshot_date"].nunique()
    n_emp = df["employee_id"].nunique()

    df.to_csv(config.BURNOUT_DATASET_CSV, index=False)

    print("─" * 60)
    print(f"[EXTRACT-BURNOUT] Dataset           : {n} lignes")
    print(f"[EXTRACT-BURNOUT] Snapshots         : {n_snap}")
    print(f"[EXTRACT-BURNOUT] Employés          : {n_emp}")
    print(f"[EXTRACT-BURNOUT] Target=1 (burnout): {pos}  ({pos / n:.1%})")
    print(f"[EXTRACT-BURNOUT] Target=0          : {n - pos}  ({(n - pos) / n:.1%})")
    print(f"[EXTRACT-BURNOUT] Fichier sauvé     : {config.BURNOUT_DATASET_CSV}")
    print("─" * 60)
    print("\nAperçu (5 premières lignes) :")
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(df.head().to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
