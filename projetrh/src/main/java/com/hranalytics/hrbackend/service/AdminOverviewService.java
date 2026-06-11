package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.AdminManagersOverviewDTO;
import com.hranalytics.hrbackend.dto.AdminRhOverviewDTO;
import com.hranalytics.hrbackend.entity.AbsenceRequest;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import com.hranalytics.hrbackend.entity.TeamObjective;
import com.hranalytics.hrbackend.repository.AbsenceRequestRepository;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.repository.EmployeeEvaluationRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.KpiThresholdRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Agrégations en lecture seule pour les pages admin « Vue Responsables » et « Vue Managers ». */
@Service
public class AdminOverviewService {

    private static final Set<String> RISK_STATUSES = Set.of("AT_RISK", "OFF_TRACK");
    private static final String PENDING = "pending";

    private final JdbcTemplate jdbc;
    private final EmployeeRepository employeeRepository;
    private final EmployeeEvaluationRepository employeeEvaluationRepository;
    private final KpiThresholdRepository kpiThresholdRepository;
    private final TeamObjectiveRepository teamObjectiveRepository;
    private final AbsenceRequestRepository absenceRequestRepository;
    private final AppUserRepository appUserRepository;

    public AdminOverviewService(JdbcTemplate jdbc,
                                EmployeeRepository employeeRepository,
                                EmployeeEvaluationRepository employeeEvaluationRepository,
                                KpiThresholdRepository kpiThresholdRepository,
                                TeamObjectiveRepository teamObjectiveRepository,
                                AbsenceRequestRepository absenceRequestRepository,
                                AppUserRepository appUserRepository) {
        this.jdbc = jdbc;
        this.employeeRepository = employeeRepository;
        this.employeeEvaluationRepository = employeeEvaluationRepository;
        this.kpiThresholdRepository = kpiThresholdRepository;
        this.teamObjectiveRepository = teamObjectiveRepository;
        this.absenceRequestRepository = absenceRequestRepository;
        this.appUserRepository = appUserRepository;
    }

    public AdminRhOverviewDTO getRhOverview() {
        LocalDate today = LocalDate.now();
        LocalDate thirtyDaysAgo = today.minusDays(30);
        int currentYear = today.getYear();

        List<Employee> employees = employeeRepository.findAll();
        long effectifTotal = employees.size();
        long embauches30Jours = employees.stream()
                .filter(e -> e.getHireDate() != null && !e.getHireDate().isBefore(thirtyDaysAgo))
                .count();

        long congesEnAttente = countLeaveRequests("status = 'pending'");
        long congesApprouvesAnnee = countLeaveRequests(
                "status = 'approved' AND EXTRACT(YEAR FROM requested_at) = " + currentYear);
        long congesRefusesAnnee = countLeaveRequests(
                "status = 'rejected' AND EXTRACT(YEAR FROM requested_at) = " + currentYear);

        double tauxPresence30Jours = computePresenceRate(thirtyDaysAgo);

        long evaluationsAnnee = employeeEvaluationRepository.findAll().stream()
                .filter(ev -> ev.getEvaluatedAt() != null && ev.getEvaluatedAt().getYear() == currentYear)
                .count();

        long seuilsKpi = kpiThresholdRepository.count();

        return new AdminRhOverviewDTO(
                effectifTotal,
                embauches30Jours,
                congesEnAttente,
                congesApprouvesAnnee,
                congesRefusesAnnee,
                tauxPresence30Jours,
                evaluationsAnnee,
                seuilsKpi,
                computeMonthlyLeaveRequests(),
                fetchRecentMovements());
    }

    public AdminManagersOverviewDTO getManagersOverview() {
        int currentYear = LocalDate.now().getYear();

        List<Employee> allEmployees = employeeRepository.findAll();
        List<Employee> managers = allEmployees.stream()
                .filter(e -> Boolean.TRUE.equals(e.getIsManager()))
                .sorted((a, b) -> fullName(a).compareToIgnoreCase(fullName(b)))
                .toList();

        Map<Integer, Long> teamSizeByManager = allEmployees.stream()
                .filter(e -> e.getManagerId() != null)
                .collect(Collectors.groupingBy(Employee::getManagerId, Collectors.counting()));

        Map<Integer, List<TeamObjective>> objectivesByManager = teamObjectiveRepository.findAll().stream()
                .collect(Collectors.groupingBy(TeamObjective::getManagerEmployeeId));

        Map<Integer, Long> pendingAbsencesByManager = absenceRequestRepository.findAll().stream()
                .filter(r -> PENDING.equalsIgnoreCase(r.getStatus()))
                .collect(Collectors.groupingBy(AbsenceRequest::getManagerId, Collectors.counting()));

        Map<Integer, Long> evaluationsByManager = employeeEvaluationRepository.findAll().stream()
                .filter(ev -> ev.getEvaluatedAt() != null && ev.getEvaluatedAt().getYear() == currentYear)
                .collect(Collectors.groupingBy(EmployeeEvaluation::getManagerId, Collectors.counting()));

        Set<Integer> activeAccountEmployeeIds = appUserRepository.findByIsActiveTrue().stream()
                .map(AppUser::getEmployee)
                .filter(e -> e != null && e.getEmployeeId() != null)
                .map(Employee::getEmployeeId)
                .collect(Collectors.toSet());

        List<AdminManagersOverviewDTO.ManagerRow> rows = managers.stream()
                .map(manager -> toManagerRow(
                        manager,
                        teamSizeByManager,
                        objectivesByManager,
                        pendingAbsencesByManager,
                        evaluationsByManager,
                        activeAccountEmployeeIds))
                .toList();

        List<TeamObjective> allObjectives = objectivesByManager.values().stream()
                .flatMap(List::stream)
                .toList();
        double avancementMoyen = allObjectives.stream()
                .filter(o -> o.getProgressPercent() != null)
                .mapToDouble(o -> o.getProgressPercent().doubleValue())
                .average()
                .orElse(0.0);
        long objectifsEnRisque = allObjectives.stream()
                .filter(o -> o.getRiskStatus() != null && RISK_STATUSES.contains(o.getRiskStatus().toUpperCase(Locale.ROOT)))
                .count();
        long absencesEnAttenteTotal = pendingAbsencesByManager.values().stream().mapToLong(Long::longValue).sum();
        long evaluationsAnnee = evaluationsByManager.values().stream().mapToLong(Long::longValue).sum();
        long managersAvecCompteActif = rows.stream().filter(AdminManagersOverviewDTO.ManagerRow::compteActif).count();

        return new AdminManagersOverviewDTO(
                managers.size(),
                managersAvecCompteActif,
                round1(avancementMoyen),
                objectifsEnRisque,
                absencesEnAttenteTotal,
                evaluationsAnnee,
                rows);
    }

    private AdminManagersOverviewDTO.ManagerRow toManagerRow(
            Employee manager,
            Map<Integer, Long> teamSizeByManager,
            Map<Integer, List<TeamObjective>> objectivesByManager,
            Map<Integer, Long> pendingAbsencesByManager,
            Map<Integer, Long> evaluationsByManager,
            Set<Integer> activeAccountEmployeeIds) {
        Integer id = manager.getEmployeeId();
        List<TeamObjective> objectives = objectivesByManager.getOrDefault(id, List.of());
        double avancement = objectives.stream()
                .filter(o -> o.getProgressPercent() != null)
                .mapToDouble(o -> o.getProgressPercent().doubleValue())
                .average()
                .orElse(0.0);
        long enRisque = objectives.stream()
                .filter(o -> o.getRiskStatus() != null && RISK_STATUSES.contains(o.getRiskStatus().toUpperCase(Locale.ROOT)))
                .count();

        return new AdminManagersOverviewDTO.ManagerRow(
                id,
                fullName(manager),
                manager.getDepartment() == null ? "" : safe(manager.getDepartment().getDepartmentName()),
                activeAccountEmployeeIds.contains(id),
                teamSizeByManager.getOrDefault(id, 0L),
                objectives.size(),
                round1(avancement),
                enRisque,
                evaluationsByManager.getOrDefault(id, 0L),
                pendingAbsencesByManager.getOrDefault(id, 0L));
    }

    private long countLeaveRequests(String whereClause) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_requests WHERE " + whereClause, Long.class);
        return count == null ? 0L : count;
    }

    private double computePresenceRate(LocalDate since) {
        Double rate = jdbc.query(
                "SELECT COUNT(*) FILTER (WHERE is_present) AS presents, COUNT(*) AS total "
                        + "FROM attendance WHERE attendance_date >= ?",
                rs -> {
                    if (rs.next()) {
                        long total = rs.getLong("total");
                        if (total > 0) {
                            return round1(rs.getLong("presents") * 100.0 / total);
                        }
                    }
                    return 0.0;
                },
                since);
        return rate != null ? rate : 0.0;
    }

    /** Demandes de congés par mois sur les 6 derniers mois (mois courant inclus). */
    private List<AdminRhOverviewDTO.MonthlyCount> computeMonthlyLeaveRequests() {
        YearMonth current = YearMonth.now();
        YearMonth start = current.minusMonths(5);

        Map<String, Long> counts = jdbc.query(
                "SELECT TO_CHAR(requested_at, 'YYYY-MM') AS ym, COUNT(*) AS total "
                        + "FROM leave_requests WHERE requested_at >= ? GROUP BY ym",
                rs -> {
                    Map<String, Long> map = new java.util.HashMap<>();
                    while (rs.next()) {
                        map.put(rs.getString("ym"), rs.getLong("total"));
                    }
                    return map;
                },
                start.atDay(1));

        List<AdminRhOverviewDTO.MonthlyCount> result = new ArrayList<>();
        for (YearMonth ym = start; !ym.isAfter(current); ym = ym.plusMonths(1)) {
            String key = String.format("%04d-%02d", ym.getYear(), ym.getMonthValue());
            String label = ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.FRENCH) + " " + ym.getYear();
            result.add(new AdminRhOverviewDTO.MonthlyCount(label,
                    counts == null ? 0L : counts.getOrDefault(key, 0L)));
        }
        return result;
    }

    private List<AdminRhOverviewDTO.RhMovement> fetchRecentMovements() {
        return jdbc.query(
                "SELECT CONCAT(e.first_name, ' ', e.last_name) AS employe, lr.type, lr.status, "
                        + "lr.start_date, lr.end_date, lr.requested_at "
                        + "FROM leave_requests lr "
                        + "LEFT JOIN employees e ON e.employee_id = lr.employee_id "
                        + "ORDER BY lr.requested_at DESC LIMIT 8",
                (rs, rowNum) -> new AdminRhOverviewDTO.RhMovement(
                        safe(rs.getString("employe")),
                        safe(rs.getString("type")),
                        safe(rs.getString("status")),
                        rs.getDate("start_date") == null ? "" : rs.getDate("start_date").toLocalDate().toString(),
                        rs.getDate("end_date") == null ? "" : rs.getDate("end_date").toLocalDate().toString(),
                        rs.getTimestamp("requested_at") == null ? ""
                                : rs.getTimestamp("requested_at").toLocalDateTime().toString()));
    }

    private String fullName(Employee employee) {
        return (safe(employee.getFirstName()) + " " + safe(employee.getLastName())).trim();
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
