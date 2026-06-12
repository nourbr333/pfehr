package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Employee;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmployeeRepository extends JpaRepository<Employee, Integer> {

    /**
     * Calcule, pour un employé à une date de référence, le vecteur de features
     * du modèle Absentéisme (P1), dans l'ordre EXACT attendu par le modèle :
     * taux_absence_30j, taux_absence_90j, nb_retards_30j, overtime_moyen_30j,
     * nb_maladie_12m, nb_approuves_12m, nb_refus_12m, dept_taux_absence,
     * anciennete, age. Reproduit la logique du script d'entraînement.
     */
    @Query(value = """
            SELECT
              COALESCE(a30.taux_absence_30j, 0)                                          AS f1,
              COALESCE(a90.taux_absence_90j, 0)                                          AS f2,
              COALESCE(a30.nb_retards_30j, 0)                                            AS f3,
              COALESCE(a30.overtime_moyen_30j, 0)                                        AS f4,
              COALESCE(ab.nb_maladie_12m, 0)                                             AS f5,
              COALESCE(ab.nb_approuves_12m, 0)                                           AS f6,
              COALESCE(ab.nb_refus_12m, 0)                                               AS f7,
              COALESCE(dept.dept_taux_absence, 0)                                        AS f8,
              COALESCE(EXTRACT(YEAR FROM age(CAST(:ref AS date), e.hire_date)), 0)       AS f9,
              COALESCE(EXTRACT(YEAR FROM age(CAST(:ref AS date), e.date_of_birth)), 0)   AS f10
            FROM employees e
            LEFT JOIN LATERAL (
              SELECT
                CAST(COUNT(*) FILTER (WHERE a.is_present = false) AS double precision)
                    / NULLIF(COUNT(*), 0)                  AS taux_absence_30j,
                COUNT(*) FILTER (WHERE a.is_late)          AS nb_retards_30j,
                AVG(a.overtime_hours)                      AS overtime_moyen_30j
              FROM attendance a
              WHERE a.employee_id = e.employee_id
                AND a.attendance_date >= CAST(:ref AS date) - 30
                AND a.attendance_date <  CAST(:ref AS date)
            ) a30 ON true
            LEFT JOIN LATERAL (
              SELECT CAST(COUNT(*) FILTER (WHERE a.is_present = false) AS double precision)
                    / NULLIF(COUNT(*), 0)                  AS taux_absence_90j
              FROM attendance a
              WHERE a.employee_id = e.employee_id
                AND a.attendance_date >= CAST(:ref AS date) - 90
                AND a.attendance_date <  CAST(:ref AS date)
            ) a90 ON true
            LEFT JOIN LATERAL (
              SELECT
                COUNT(*) FILTER (WHERE r.absence_type = 'maladie') AS nb_maladie_12m,
                COUNT(*) FILTER (WHERE r.status = 'approuvee')     AS nb_approuves_12m,
                COUNT(*) FILTER (WHERE r.status = 'refusee')       AS nb_refus_12m
              FROM absence_requests r
              WHERE r.employee_id = e.employee_id
                AND r.start_date >= CAST(:ref AS date) - 365
                AND r.start_date <  CAST(:ref AS date)
            ) ab ON true
            LEFT JOIN LATERAL (
              SELECT CAST(COUNT(*) FILTER (WHERE a.is_present = false) AS double precision)
                    / NULLIF(COUNT(*), 0)                  AS dept_taux_absence
              FROM attendance a
              JOIN employees e2 ON e2.employee_id = a.employee_id
              WHERE e2.department_id = e.department_id
                AND a.attendance_date >= CAST(:ref AS date) - 30
                AND a.attendance_date <  CAST(:ref AS date)
            ) dept ON true
            WHERE e.employee_id = :employeeId
            """, nativeQuery = true)
    List<Object[]> findAbsenteeismFeatures(@Param("employeeId") Integer employeeId,
                                           @Param("ref") LocalDate ref);


    @Query("""
            SELECT e FROM Employee e
            WHERE (:departmentId IS NULL OR e.department.departmentId = :departmentId)
              AND (
                    :search IS NULL OR TRIM(:search) = ''
                    OR LOWER(e.firstName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(e.lastName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(CONCAT(e.firstName, ' ', e.lastName)) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR CONCAT(e.employeeId, '') LIKE CONCAT('%', :search, '%')
                  )
            """)
    Page<Employee> findFiltered(
            @Param("search") String search,
            @Param("departmentId") Integer departmentId,
            Pageable pageable);
    List<Employee> findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(String firstName, String lastName);
    List<Employee> findByDepartment_DepartmentId(Integer departmentId);
    long countByDepartment_DepartmentId(Integer departmentId);

    @Query("select e.department.departmentId, count(e) from Employee e where e.department is not null group by e.department.departmentId")
    List<Object[]> countGroupedByDepartment();
    List<Employee> findByManagerIdOrEmployeeId(Integer managerId, Integer employeeId);
    boolean existsByEmployeeIdAndManagerId(Integer employeeId, Integer managerId);

    boolean existsByEmailIgnoreCase(String email);
    boolean existsByEmployeeIdNotAndEmailIgnoreCase(Integer employeeId, String email);
    boolean existsByManagerId(Integer managerId);
    List<Employee> findByManagerId(Integer managerId);
    List<Employee> findByIsManagerTrue();

    @Query("select coalesce(max(e.employeeId), 0) from Employee e")
    Integer findMaxEmployeeId();
}
