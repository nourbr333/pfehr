"""P3 — Extraction des features du dataset OKR (Non-Atteinte des OKR).

Approche par snapshots : pour chaque objectif dont l'échéance est passée,
on génère des snapshots à intervalles réguliers (OKR_SNAPSHOT_INTERVAL_DAYS)
pendant sa durée de vie. À chaque snapshot on calcule les 10 features ;
la variable cible est fixe pour tout l'objectif : target = 1 si l'objectif
s'est terminé avec progress_percent < OKR_FAILURE_THRESHOLD.

Note : jalons/milestones exclus volontairement du périmètre.
"""
from __future__ import annotations

import sys

import pandas as pd
from sqlalchemy import create_engine, text

import config

SQL = text(
    """
WITH past_objectives AS (
    SELECT
        o.objective_id,
        o.created_at,
        o.due_date,
        o.progress_percent                                                   AS final_progress,
        o.owner_employee_id,
        o.manager_employee_id,
        CASE WHEN o.progress_percent < :failure_threshold THEN 1 ELSE 0 END AS target_non_atteint
    FROM team_objectives o
    WHERE o.due_date < CURRENT_DATE
),
snap_series AS (
    SELECT
        po.objective_id,
        po.target_non_atteint,
        po.due_date,
        po.created_at,
        po.owner_employee_id,
        po.manager_employee_id,
        gs::date AS snap
    FROM past_objectives po,
         LATERAL generate_series(
             po.created_at::date + :interval_days,
             po.due_date - 1,
             make_interval(days => :interval_days)
         ) AS gs
)
SELECT
    s.objective_id,
    s.snap                                  AS snapshot_date,

    COALESCE((
        SELECT pu.progress_percent
        FROM   objective_progress_updates pu
        WHERE  pu.objective_id = s.objective_id
          AND  pu.updated_at::date <= s.snap
        ORDER  BY pu.updated_at DESC
        LIMIT  1
    ), 0)                                   AS progress_actuel,

    GREATEST(0,
        (s.due_date - s.snap)::float
        / NULLIF((s.due_date - s.created_at::date)::float, 0)
    )                                       AS jours_restants_ratio,

    COALESCE(mem_att.taux_equipe,   0)      AS taux_absence_equipe_30j,
    COALESCE(mem_att.nb_absents,    0)      AS nb_absents_auj,

    COALESCE(upd.delta_30j,         0)      AS delta_progress_30j,
    COALESCE(upd.nb_updates_30j,    0)      AS nb_updates_30j,

    COALESCE(mem_cnt.nb_membres,    1)      AS nb_membres,

    CASE WHEN ap.nb_plans > 0 THEN 1.0
         ELSE 0.0 END                       AS has_action_plan,

    COALESCE(dep.nb_open,           0)      AS nb_dependances,

    COALESCE(mgr.taux_presence,     1.0)    AS manager_taux_presence,

    s.target_non_atteint

FROM snap_series s

LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE a.is_present = false)::float
            / NULLIF(COUNT(*), 0)                            AS taux_equipe,
        COUNT(*) FILTER (
            WHERE a.attendance_date = s.snap AND a.is_present = false
        )                                                    AS nb_absents
    FROM attendance a
    WHERE a.employee_id IN (
        SELECT tom.employee_id
        FROM   team_objective_members tom
        WHERE  tom.objective_id = s.objective_id
        UNION
        SELECT s.owner_employee_id
        WHERE  NOT EXISTS (
            SELECT 1 FROM team_objective_members tom2
            WHERE tom2.objective_id = s.objective_id
        )
    )
      AND a.attendance_date >= s.snap - 30
      AND a.attendance_date <= s.snap
) mem_att ON true

LEFT JOIN LATERAL (
    SELECT
        COALESCE(MAX(CASE WHEN pu.updated_at::date <= s.snap
                     THEN pu.progress_percent::float END), 0)
        - COALESCE(MAX(CASE WHEN pu.updated_at::date <= s.snap - 30
                        THEN pu.progress_percent::float END), 0)    AS delta_30j,
        COUNT(*) FILTER (
            WHERE pu.updated_at::date >  s.snap - 30
              AND pu.updated_at::date <= s.snap
        )                                                            AS nb_updates_30j
    FROM objective_progress_updates pu
    WHERE pu.objective_id = s.objective_id
) upd ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS nb_membres
    FROM   team_objective_members tom
    WHERE  tom.objective_id = s.objective_id
) mem_cnt ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS nb_plans
    FROM   objective_action_plans ap2
    WHERE  ap2.objective_id = s.objective_id
) ap ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS nb_open
    FROM   objective_dependencies od
    WHERE  od.objective_id = s.objective_id
      AND  od.blocking_status = 'OPEN'
) dep ON true

LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE a.is_present = true)::float
               / NULLIF(COUNT(*), 0) AS taux_presence
    FROM attendance a
    WHERE a.employee_id = s.manager_employee_id
      AND a.attendance_date >= s.snap - 30
      AND a.attendance_date <= s.snap
) mgr ON true

ORDER BY s.snap, s.objective_id
"""
)


def extract() -> pd.DataFrame:
    engine = create_engine(config.DB_URL)
    params = {
        "failure_threshold": config.OKR_FAILURE_THRESHOLD,
        "interval_days": config.OKR_SNAPSHOT_INTERVAL_DAYS,
    }
    with engine.connect() as conn:
        df = pd.read_sql(SQL, conn, params=params)

    df.fillna(0, inplace=True)
    return df


def main() -> int:
    print("[EXTRACT-OKR] Connexion à la base et extraction des features OKR...")
    try:
        df = extract()
    except Exception as exc:  # noqa: BLE001
        print(f"[EXTRACT-OKR] ERREUR : {exc}")
        return 1

    if df.empty:
        print(
            "[EXTRACT-OKR] Dataset VIDE — aucun objectif avec une échéance passée.\n"
            "  Conseil : créez quelques objectifs avec une due_date < aujourd'hui dans l'app.\n"
            "  Au minimum 2-3 objectifs terminés sont nécessaires pour entraîner le modèle."
        )
        return 1

    n = len(df)
    pos = int(df[config.OKR_TARGET].sum())
    n_snap = df["snapshot_date"].nunique()
    n_obj = df["objective_id"].nunique()

    df.to_csv(config.OKR_DATASET_CSV, index=False)

    print("─" * 60)
    print(f"[EXTRACT-OKR] Dataset          : {n} lignes")
    print(f"[EXTRACT-OKR] Objectifs passés : {n_obj}")
    print(f"[EXTRACT-OKR] Snapshots        : {n_snap}")
    print(f"[EXTRACT-OKR] Target=1 (échec) : {pos}  ({pos / n:.1%})")
    print(f"[EXTRACT-OKR] Target=0 (succès): {n - pos}  ({(n - pos) / n:.1%})")
    print(f"[EXTRACT-OKR] Fichier sauvé    : {config.OKR_DATASET_CSV}")
    print("─" * 60)
    print("\nAperçu (5 premières lignes) :")
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(df.head().to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
