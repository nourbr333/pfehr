package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.DepartmentEmployeeDTO;
import com.hranalytics.hrbackend.dto.DepartmentStatsDTO;
import com.hranalytics.hrbackend.entity.Attendance;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import com.hranalytics.hrbackend.repository.AttendanceRepository;
import com.hranalytics.hrbackend.repository.DepartmentRepository;
import com.hranalytics.hrbackend.repository.EmployeeEvaluationRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final EmployeeRepository employeeRepository;
    private final AttendanceRepository attendanceRepository;
    private final EmployeeEvaluationRepository employeeEvaluationRepository;

    public DepartmentService(
            DepartmentRepository departmentRepository,
            EmployeeRepository employeeRepository,
            AttendanceRepository attendanceRepository,
            EmployeeEvaluationRepository employeeEvaluationRepository) {
        this.departmentRepository = departmentRepository;
        this.employeeRepository = employeeRepository;
        this.attendanceRepository = attendanceRepository;
        this.employeeEvaluationRepository = employeeEvaluationRepository;
    }

    public List<Department> getAllDepartments() {
        Map<Integer, Long> countByDepartmentId = employeeRepository.countGroupedByDepartment().stream()
                .collect(Collectors.toMap(
                        row -> (Integer) row[0],
                        row -> (Long) row[1]));
        return departmentRepository.findAll().stream()
                .map(source -> withDynamicEmployeeCount(source, countByDepartmentId))
                .toList();
    }

    public List<DepartmentStatsDTO> getAllDepartmentStats() {
        return departmentRepository.findAll().stream().map(this::buildDepartmentStats).toList();
    }

    public DepartmentStatsDTO getDepartmentStatsById(Integer departmentId) {
        @SuppressWarnings("null")
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId));
        return buildDepartmentStats(department);
    }

    public List<DepartmentEmployeeDTO> getDepartmentEmployees(Integer departmentId) {
        @SuppressWarnings("null")
        boolean exists = departmentRepository.existsById(departmentId);
        if (!exists) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId);
        }

        return employeeRepository.findByDepartment_DepartmentId(departmentId).stream()
                .map(this::toDepartmentEmployeeDto)
                .toList();
    }

    private DepartmentStatsDTO buildDepartmentStats(Department department) {
        List<Employee> employees = employeeRepository.findByDepartment_DepartmentId(department.getDepartmentId());
        List<Integer> employeeIds = employees.stream().map(Employee::getEmployeeId).toList();

        DepartmentStatsDTO dto = new DepartmentStatsDTO();
        dto.setDepartmentId(department.getDepartmentId());
        dto.setDepartmentName(department.getDepartmentName());
        dto.setEmployeeCount(employees.size());

        if (employeeIds.isEmpty()) {
            dto.setEvaluatedEmployees(0);
            dto.setAveragePerformanceScore(0.0);
            dto.setAverageAttendanceRate(0.0);
            return dto;
        }

        List<Attendance> attendances = attendanceRepository.findByEmployeeIdIn(employeeIds);
        Map<Integer, Double> attendanceRateByEmployeeId = attendances.stream()
                .collect(Collectors.groupingBy(
                        Attendance::getEmployeeId,
                        Collectors.collectingAndThen(
                                Collectors.toList(),
                                rows -> rows.isEmpty() ? null
                                        : rows.stream().filter(r -> Boolean.TRUE.equals(r.getIsPresent())).count() * 100.0 / rows.size())));

        // Score de ponctualité par employé : (1 - retards/total) × 100
        Map<Integer, Double> punctualityScoreByEmployeeId = attendances.stream()
                .collect(Collectors.groupingBy(
                        Attendance::getEmployeeId,
                        Collectors.collectingAndThen(
                                Collectors.toList(),
                                rows -> {
                                    if (rows.isEmpty()) return null;
                                    long lateDays = rows.stream().filter(r -> Boolean.TRUE.equals(r.getIsLate())).count();
                                    return (1.0 - (double) lateDays / rows.size()) * 100.0;
                                })));

        double averageAttendanceRate = attendanceRateByEmployeeId.values().stream()
                .filter(rate -> rate != null)
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);

        List<EmployeeEvaluation> evaluations = employeeEvaluationRepository.findByEmployeeIdIn(employeeIds);
        // On ne retient que les évaluations avec un rating renseigné (contribuent au score)
        Map<Integer, EmployeeEvaluation> latestEvaluationByEmployee = evaluations.stream()
                .filter(evaluation -> evaluation.getRating() != null)
                .collect(Collectors.toMap(
                        EmployeeEvaluation::getEmployeeId, Function.identity(), this::newestEvaluation));
        // evaluatedEmployees = employés distincts ayant une évaluation avec rating ce mois courant
        LocalDate firstOfMonth = LocalDate.now().withDayOfMonth(1);
        LocalDate lastOfMonth  = firstOfMonth.plusMonths(1).minusDays(1);
        int evaluatedCount = (int) evaluations.stream()
                .filter(e -> e.getRating() != null
                        && e.getEvaluatedAt() != null
                        && !e.getEvaluatedAt().isBefore(firstOfMonth)
                        && !e.getEvaluatedAt().isAfter(lastOfMonth))
                .map(EmployeeEvaluation::getEmployeeId)
                .distinct()
                .count();

        // Formule composite : présence 40% + évaluation 40% + ponctualité 20%
        double averagePerformanceScore = employeeIds.stream()
                .map(employeeId -> computeEmployeePerformanceScore(
                        latestEvaluationByEmployee.get(employeeId),
                        attendanceRateByEmployeeId.get(employeeId),
                        punctualityScoreByEmployeeId.get(employeeId)))
                .flatMap(Optional::stream)
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);

        dto.setEvaluatedEmployees(evaluatedCount);
        dto.setAveragePerformanceScore(roundToTwoDecimals(averagePerformanceScore));
        dto.setAverageAttendanceRate(roundToTwoDecimals(averageAttendanceRate));
        return dto;
    }

    private EmployeeEvaluation newestEvaluation(EmployeeEvaluation left, EmployeeEvaluation right) {
        if (left.getEvaluatedAt() == null && right.getEvaluatedAt() == null) {
            return safeEvaluationId(left) >= safeEvaluationId(right) ? left : right;
        }
        if (left.getEvaluatedAt() == null) {
            return right;
        }
        if (right.getEvaluatedAt() == null) {
            return left;
        }
        int compareDate = left.getEvaluatedAt().compareTo(right.getEvaluatedAt());
        if (compareDate == 0) {
            return safeEvaluationId(left) >= safeEvaluationId(right) ? left : right;
        }
        return compareDate > 0 ? left : right;
    }

    private int safeEvaluationId(EmployeeEvaluation evaluation) {
        return evaluation.getEvaluationId() == null ? 0 : evaluation.getEvaluationId();
    }

    private double normalizedRating(EmployeeEvaluation evaluation) {
        if (evaluation.getRating() == null) {
            return 0.0;
        }
        double raw = evaluation.getRating().doubleValue();
        double normalized = raw > 5.0 ? raw : (raw * 20.0);
        return Math.max(0.0, Math.min(100.0, normalized));
    }

    /**
     * Score composite par employé avec poids normalisés sur les composantes disponibles.
     * <p>
     * Poids nominaux : présence 40% · évaluation 40% · ponctualité 20%.
     * Si une composante est absente (données manquantes, pas encore évalué…), son poids
     * est redistribué proportionnellement entre les composantes présentes afin de ne pas
     * pénaliser un employé pour un manque de données hors de son contrôle.
     * <p>
     * Exemple : présence 90%, ponctualité 90%, pas d'évaluation →
     * poids effectifs : présence 40/(40+20)=66.7%, ponctualité 20/(40+20)=33.3%
     * → score = 90×0.667 + 90×0.333 = 90/100 (et non 54/100).
     * <p>
     * Retourne {@code Optional.empty()} si aucune composante n'est disponible.
     */
    private Optional<Double> computeEmployeePerformanceScore(
            EmployeeEvaluation evaluation, Double attendanceRate, Double punctualityScore) {
        if (evaluation == null && attendanceRate == null && punctualityScore == null) {
            return Optional.empty();
        }

        // Poids nominaux
        final double W_PRESENCE    = 0.40;
        final double W_EVALUATION  = 0.40;
        final double W_PUNCTUALITY = 0.20;

        // Calcul du poids total effectif (seulement les composantes disponibles)
        double totalWeight = 0.0;
        if (attendanceRate  != null) totalWeight += W_PRESENCE;
        if (evaluation      != null) totalWeight += W_EVALUATION;
        if (punctualityScore != null) totalWeight += W_PUNCTUALITY;

        // totalWeight ne peut pas être 0 ici (guard clause ci-dessus)
        double presenceScore  = attendanceRate   != null ? Math.max(0.0, Math.min(100.0, attendanceRate))   : 0.0;
        double evalScore      = evaluation       != null ? normalizedRating(evaluation)                      : 0.0;
        double punctualScore  = punctualityScore != null ? Math.max(0.0, Math.min(100.0, punctualityScore))  : 0.0;

        double composite = ((presenceScore * W_PRESENCE) + (evalScore * W_EVALUATION) + (punctualScore * W_PUNCTUALITY))
                / totalWeight * 100.0;
        return Optional.of(Math.max(0.0, Math.min(100.0, composite)));
    }

    private DepartmentEmployeeDTO toDepartmentEmployeeDto(Employee employee) {
        DepartmentEmployeeDTO dto = new DepartmentEmployeeDTO();
        dto.setEmployeeId(employee.getEmployeeId());
        dto.setFirstName(employee.getFirstName());
        dto.setLastName(employee.getLastName());
        dto.setJobTitle(employee.getJobTitle());
        return dto;
    }

    private Department withDynamicEmployeeCount(Department source, Map<Integer, Long> countByDepartmentId) {
        Integer departmentId = source.getDepartmentId();
        Department department = new Department();
        department.setDepartmentId(departmentId);
        department.setDepartmentName(source.getDepartmentName());
        department.setDepartmentHead(source.getDepartmentHead());
        int employeeCount = departmentId == null
                ? 0
                : countByDepartmentId.getOrDefault(departmentId, 0L).intValue();
        department.setEmployeeCount(employeeCount);
        return department;
    }

    private double roundToTwoDecimals(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
