package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.TeamObjective;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TeamObjectiveRepository extends JpaRepository<TeamObjective, Long> {
    List<TeamObjective> findByManagerEmployeeIdOrderByDueDateAsc(Integer managerEmployeeId);

    Optional<TeamObjective> findByObjectiveIdAndManagerEmployeeId(Long objectiveId, Integer managerEmployeeId);

    /**
     * Calcule le vecteur de 10 features OKR dans l'ordre EXACT attendu par le modèle P3 :
     * progress_actuel, jours_restants_ratio, taux_absence_equipe_30j, nb_absents_auj,
     * delta_progress_30j, nb_updates_30j, nb_membres, has_action_plan,
     * nb_dependances, manager_taux_presence.
     * Jalons/milestones exclus volontairement.
     */
    @Query(value = """
            SELECT
              COALESCE((
                SELECT pu.progress_percent
                FROM   objective_progress_updates pu
                WHERE  pu.objective_id = o.objective_id
                  AND  pu.updated_at <= CAST(:ref AS timestamp)
                ORDER  BY pu.updated_at DESC
                LIMIT  1
              ), o.progress_percent)                                                  AS f1,

              GREATEST(0,
                CAST((o.due_date - CAST(:ref AS date)) AS double precision)
                / NULLIF(CAST((o.due_date - CAST(o.created_at AS date)) AS double precision), 0)
              )                                                                       AS f2,

              COALESCE(mem_att.taux_equipe,  0)                                      AS f3,
              COALESCE(mem_att.nb_absents,   0)                                      AS f4,

              COALESCE(upd.delta_30j,        0)                                      AS f5,
              COALESCE(upd.nb_updates_30j,   0)                                      AS f6,

              COALESCE(mem_cnt.nb_membres,   1)                                      AS f7,

              CASE WHEN ap.nb_plans > 0 THEN 1.0 ELSE 0.0 END                       AS f8,

              COALESCE(dep.nb_open,          0)                                      AS f9,

              COALESCE(mgr.taux_presence,    1.0)                                    AS f10

            FROM team_objectives o

            LEFT JOIN LATERAL (
              SELECT
                CAST(COUNT(*) FILTER (WHERE a.is_present = false) AS double precision)
                    / NULLIF(COUNT(*), 0)                                             AS taux_equipe,
                COUNT(*) FILTER (
                    WHERE a.attendance_date = CAST(:ref AS date) AND a.is_present = false
                )                                                                     AS nb_absents
              FROM attendance a
              WHERE a.employee_id IN (
                SELECT tom.employee_id
                FROM   team_objective_members tom
                WHERE  tom.objective_id = o.objective_id
                UNION
                SELECT o.owner_employee_id
                WHERE  NOT EXISTS (
                  SELECT 1 FROM team_objective_members tom2
                  WHERE tom2.objective_id = o.objective_id
                )
              )
                AND a.attendance_date >= CAST(:ref AS date) - 30
                AND a.attendance_date <= CAST(:ref AS date)
            ) mem_att ON true

            LEFT JOIN LATERAL (
              SELECT
                COALESCE(MAX(CASE WHEN pu.updated_at <= CAST(:ref AS timestamp)
                             THEN CAST(pu.progress_percent AS double precision) END), 0)
                - COALESCE(MAX(CASE WHEN pu.updated_at <= CAST(:ref AS timestamp) - INTERVAL '30 days'
                               THEN CAST(pu.progress_percent AS double precision) END), 0)   AS delta_30j,
                COUNT(*) FILTER (
                    WHERE pu.updated_at >  CAST(:ref AS timestamp) - INTERVAL '30 days'
                      AND pu.updated_at <= CAST(:ref AS timestamp)
                )                                                                     AS nb_updates_30j
              FROM objective_progress_updates pu
              WHERE pu.objective_id = o.objective_id
            ) upd ON true

            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS nb_membres
              FROM   team_objective_members tom
              WHERE  tom.objective_id = o.objective_id
            ) mem_cnt ON true

            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS nb_plans
              FROM   objective_action_plans ap2
              WHERE  ap2.objective_id = o.objective_id
            ) ap ON true

            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS nb_open
              FROM   objective_dependencies od
              WHERE  od.objective_id = o.objective_id
                AND  od.blocking_status = 'OPEN'
            ) dep ON true

            LEFT JOIN LATERAL (
              SELECT CAST(COUNT(*) FILTER (WHERE a.is_present = true) AS double precision)
                         / NULLIF(COUNT(*), 0)                                        AS taux_presence
              FROM attendance a
              WHERE a.employee_id = o.manager_employee_id
                AND a.attendance_date >= CAST(:ref AS date) - 30
                AND a.attendance_date <= CAST(:ref AS date)
            ) mgr ON true

            WHERE o.objective_id = :objectiveId
            """, nativeQuery = true)
    List<Object[]> findOkrFeatures(@Param("objectiveId") Long objectiveId,
                                   @Param("ref") LocalDate ref);
}
