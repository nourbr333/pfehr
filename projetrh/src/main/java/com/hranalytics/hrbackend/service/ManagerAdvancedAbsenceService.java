package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.ContinuityPlanResultDTO;
import com.hranalytics.hrbackend.dto.CreateContinuityPlanDTO;
import com.hranalytics.hrbackend.dto.DateAlternativeRequestDTO;
import com.hranalytics.hrbackend.dto.DateAlternativeResponseDTO;
import com.hranalytics.hrbackend.dto.ManagerAdvancedAbsenceDashboardDTO;
import com.hranalytics.hrbackend.entity.AbsenceRequest;
import com.hranalytics.hrbackend.entity.ContinuityPlan;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.EmployeeCoverageProfile;
import com.hranalytics.hrbackend.entity.TeamObjective;
import com.hranalytics.hrbackend.repository.ContinuityPlanRepository;
import com.hranalytics.hrbackend.repository.EmployeeCoverageProfileRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveMemberRepository;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManagerAdvancedAbsenceService {
    private static final Set<String> APPROVED_STATUSES = Set.of("approuvee", "approved");
    private static final Set<String> PENDING_STATUSES = Set.of("en_attente", "pending");
    private static final Set<String> REFUSED_STATUSES = Set.of("refusee", "refused", "rejected", "cancelled", "expired");
    private static final Set<String> FULL_ABSENCE_TYPES = Set.of("conge-paye", "maladie", "sans-solde", "evenement-familial", "autre");

    private final EmployeeRepository employeeRepository;
    private final EmployeeCoverageProfileRepository coverageProfileRepository;
    private final TeamObjectiveRepository teamObjectiveRepository;
    private final TeamObjectiveMemberRepository teamObjectiveMemberRepository;
    private final ContinuityPlanRepository continuityPlanRepository;
    private final JdbcTemplate jdbc;

    public ManagerAdvancedAbsenceService(
            EmployeeRepository employeeRepository,
            EmployeeCoverageProfileRepository coverageProfileRepository,
            TeamObjectiveRepository teamObjectiveRepository,
            TeamObjectiveMemberRepository teamObjectiveMemberRepository,
            ContinuityPlanRepository continuityPlanRepository,
            JdbcTemplate jdbc) {
        this.employeeRepository = employeeRepository;
        this.coverageProfileRepository = coverageProfileRepository;
        this.teamObjectiveRepository = teamObjectiveRepository;
        this.teamObjectiveMemberRepository = teamObjectiveMemberRepository;
        this.continuityPlanRepository = continuityPlanRepository;
        this.jdbc = jdbc;
    }

    public ManagerAdvancedAbsenceDashboardDTO getDashboard(
            Integer managerId, String viewModeRaw, LocalDate referenceDate, Integer thresholdRaw) {
        String viewMode = normalizeViewMode(viewModeRaw);
        int threshold = thresholdRaw == null || thresholdRaw < 1 ? 2 : thresholdRaw;
        LocalDate anchorDate = referenceDate == null ? LocalDate.now() : referenceDate;
        LocalDate periodStart = viewMode.equals("weekly")
                ? anchorDate.with(TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY))
                : anchorDate.withDayOfMonth(1);
        LocalDate periodEnd = viewMode.equals("weekly")
                ? periodStart.plusDays(6)
                : periodStart.with(TemporalAdjusters.lastDayOfMonth());

        List<Employee> teamMembers = employeeRepository.findByManagerIdOrEmployeeId(managerId, managerId);
        Map<Integer, Employee> employeeById = teamMembers.stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, employee -> employee, (left, right) -> left));
        List<Integer> teamIds = new ArrayList<>(employeeById.keySet());

        Map<Integer, EmployeeCoverageProfile> profileByEmployeeId = teamIds.isEmpty()
                ? Map.of()
                : coverageProfileRepository.findByEmployeeIdIn(teamIds).stream()
                        .collect(Collectors.toMap(
                                EmployeeCoverageProfile::getEmployeeId, profile -> profile, (left, right) -> left));

        // Read directly from leave_requests filtered by team (source of truth)
        List<AbsenceRequest> periodRequests =
                fetchTeamLeaveRequestsForPeriod(teamIds, managerId, periodStart, periodEnd);

        List<AbsenceRequest> approvedPeriodRequests = periodRequests.stream()
                .filter(request -> isApproved(request.getStatus()))
                .toList();

        // ── Coverage alerts first (needed for conflictsDetected in pipeline) ──
        List<ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO> coverageAlerts = buildCoverageAlerts(
                approvedPeriodRequests, employeeById, profileByEmployeeId, periodStart, periodEnd, threshold);

        // ── Existing continuity plans for backupAssigned flag ──
        List<ContinuityPlan> existingPlans = continuityPlanRepository.findByManagerIdOrderByCreatedAtDesc(managerId);
        Set<Long> coveredRequestIds = existingPlans.stream()
                .map(p -> p.getRequestId().longValue())
                .collect(Collectors.toSet());
        Map<Long, String> backupNameByRequestId = new java.util.HashMap<>();
        for (ContinuityPlan p : existingPlans) {
            if (p.getBackupEmployeeId() != null) {
                Long rid = p.getRequestId().longValue();
                if (!backupNameByRequestId.containsKey(rid)) {
                    Employee backup = employeeById.get(p.getBackupEmployeeId());
                    if (backup != null) {
                        backupNameByRequestId.put(rid, resolveEmployeeName(backup, p.getBackupEmployeeId()));
                    }
                }
            }
        }

        // ── Cumulative absence days (current period) — attendance + leave_requests, deduplicated ──
        int cumulativeDays = countTeamAbsenceDaysUnion(teamIds, periodStart, periodEnd);

        // ── Previous month stats (M-1, monthly granularity) ──
        LocalDate prevStart = periodStart.minusMonths(1).withDayOfMonth(1);
        LocalDate prevEnd = prevStart.with(TemporalAdjusters.lastDayOfMonth());
        List<AbsenceRequest> prevApproved = teamIds.isEmpty() ? List.of()
                : fetchTeamLeaveRequestsForPeriod(teamIds, managerId, prevStart, prevEnd).stream()
                        .filter(r -> isApproved(r.getStatus())).toList();
        int prevMonthAbsenceDays = countTeamAbsenceDaysUnion(teamIds, prevStart, prevEnd);
        double prevMonthAbsenceRate = teamMembers.isEmpty() ? 0.0
                : (prevApproved.size() * 100.0 / teamMembers.size());

        // ── Attendance-based absence rate (is_present=false / total rows × 100) ──
        // Scoped to subordinates only (excludes manager), weekdays only — mirrors accueil-manager presenceKpi
        List<Integer> subordinateIds = teamIds.stream()
                .filter(id -> !id.equals(managerId))
                .toList();
        LocalDate today = LocalDate.now();
        LocalDate attendanceFrom = periodStart.isBefore(today) ? periodStart : today;
        double attendanceAbsenceRate = computeAttendanceRate(subordinateIds, attendanceFrom, today);
        // Prev month: full month
        double prevAttendanceAbsenceRate = computeAttendanceRate(subordinateIds, prevStart, prevEnd);

        // ── Assemble dashboard ──
        ManagerAdvancedAbsenceDashboardDTO dashboard = new ManagerAdvancedAbsenceDashboardDTO();
        dashboard.setViewMode(viewMode);
        dashboard.setPeriodStart(periodStart);
        dashboard.setPeriodEnd(periodEnd);
        dashboard.setSimultaneousAbsenceThreshold(threshold);
        dashboard.setTotalTeamMembers((int) teamMembers.stream()
                .filter(e -> !e.getEmployeeId().equals(managerId))
                .count());
        dashboard.setActiveApprovedAbsences(approvedPeriodRequests.size());
        dashboard.setCumulativeAbsenceDays(cumulativeDays);
        dashboard.setPrevMonthAbsenceDays(prevMonthAbsenceDays);
        dashboard.setPrevMonthAbsenceRate(prevMonthAbsenceRate);
        dashboard.setAttendanceAbsenceRate(attendanceAbsenceRate);
        dashboard.setPrevAttendanceAbsenceRate(prevAttendanceAbsenceRate);
        dashboard.setCalendarAbsences(mapCalendarAbsences(periodRequests, employeeById, profileByEmployeeId,
                coveredRequestIds, backupNameByRequestId));
        dashboard.setCoverageAlerts(coverageAlerts);
        dashboard.setProjectImpacts(buildProjectImpacts(managerId, teamIds, employeeById, coveredRequestIds, backupNameByRequestId));
        dashboard.setPipeline(buildPipeline(teamIds, managerId, employeeById, coverageAlerts));
        dashboard.setTeamBackups(mapBackupChoices(teamMembers, profileByEmployeeId));
        return dashboard;
    }

    public DateAlternativeResponseDTO suggestAlternatives(Integer managerId, DateAlternativeRequestDTO payload) {
        if (payload == null || payload.getRequestId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "request_id est obligatoire.");
        }
        AbsenceRequest request = resolveLeaveRequestForManager(payload.getRequestId(), managerId);
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "demande introuvable.");
        }

        LocalDate baseStart = payload.getPreferredStartDate() != null ? payload.getPreferredStartDate() : request.getStartDate();
        LocalDate baseEnd = payload.getPreferredEndDate() != null ? payload.getPreferredEndDate() : request.getEndDate();
        if (baseEnd == null || baseStart == null || baseEnd.isBefore(baseStart)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "plage de dates invalide.");
        }

        int duration = (int) (baseEnd.toEpochDay() - baseStart.toEpochDay() + 1);
        int windowDays = payload.getSearchWindowDays() == null ? 60 : Math.max(7, Math.min(120, payload.getSearchWindowDays()));
        int maxAlternatives = payload.getMaxAlternatives() == null ? 5 : Math.max(1, Math.min(10, payload.getMaxAlternatives()));

        LocalDate searchEnd = baseStart.plusDays(windowDays);
        List<Integer> conflictTeamIds = employeeRepository.findByManagerIdOrEmployeeId(managerId, managerId)
                .stream().map(Employee::getEmployeeId).toList();
        List<AbsenceRequest> conflicts = fetchTeamLeaveRequestsForPeriod(conflictTeamIds, managerId, baseStart, searchEnd)
                .stream()
                .filter(existing -> !Objects.equals(existing.getRequestId(), request.getRequestId()))
                .filter(existing -> isApproved(existing.getStatus()))
                .toList();

        List<DateAlternativeResponseDTO.DateAlternativeOptionDTO> options = new ArrayList<>();
        for (int offset = 1; offset <= windowDays && options.size() < maxAlternatives; offset++) {
            LocalDate candidateStart = baseStart.plusDays(offset);
            LocalDate candidateEnd = candidateStart.plusDays(duration - 1L);
            int simultaneous = maxSimultaneous(conflicts, candidateStart, candidateEnd);
            if (simultaneous >= 2) {
                continue;
            }
            DateAlternativeResponseDTO.DateAlternativeOptionDTO option = new DateAlternativeResponseDTO.DateAlternativeOptionDTO();
            option.setStartDate(candidateStart);
            option.setEndDate(candidateEnd);
            option.setSimultaneousAbsences(simultaneous);
            option.setNote(simultaneous == 0 ? "aucun conflit détecté" : "conflit faible");
            options.add(option);
        }

        DateAlternativeResponseDTO response = new DateAlternativeResponseDTO();
        response.setRequestId(request.getRequestId());
        response.setRequestedStartDate(request.getStartDate());
        response.setRequestedEndDate(request.getEndDate());
        response.setAlternatives(options);
        return response;
    }

    public ContinuityPlanResultDTO createContinuityPlan(Integer managerId, CreateContinuityPlanDTO payload) {
        if (payload == null || payload.getRequestId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "request_id est obligatoire.");
        }
        AbsenceRequest request = resolveLeaveRequestForManager(payload.getRequestId(), managerId);
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "demande introuvable.");
        }
        if (!isApproved(request.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "seules les absences approuvées peuvent avoir un plan de continuité.");
        }
        if (request.getEndDate() != null && request.getEndDate().isBefore(LocalDate.now())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "cette absence est déjà terminée, un plan de continuité ne peut plus être créé.");
        }
        if (payload.getBackupEmployeeId() != null
                && !employeeRepository.existsByEmployeeIdAndManagerId(payload.getBackupEmployeeId(), managerId)
                && !Objects.equals(payload.getBackupEmployeeId(), managerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "backup employee hors équipe manager.");
        }

        ContinuityPlan continuityPlan = new ContinuityPlan();
        continuityPlan.setManagerId(managerId);
        continuityPlan.setRequestId(request.getRequestId().intValue());
        continuityPlan.setEmployeeId(request.getEmployeeId());
        continuityPlan.setBackupEmployeeId(payload.getBackupEmployeeId());
        continuityPlan.setPlanStatus("created");
        continuityPlan.setNotes(clean(payload.getNotes()));
        continuityPlan.setCreatedAt(LocalDateTime.now());
        ContinuityPlan savedPlan = continuityPlanRepository.save(continuityPlan);

        ContinuityPlanResultDTO response = new ContinuityPlanResultDTO();
        response.setPlanId(savedPlan.getPlanId());
        response.setRequestId(savedPlan.getRequestId());
        response.setEmployeeId(savedPlan.getEmployeeId());
        response.setBackupEmployeeId(savedPlan.getBackupEmployeeId());
        response.setStatus(savedPlan.getPlanStatus());
        response.setNotes(savedPlan.getNotes());
        response.setCreatedAt(savedPlan.getCreatedAt());
        return response;
    }

    public List<ContinuityPlanResultDTO> getContinuityPlans(Integer managerId) {
        List<ContinuityPlan> plans = continuityPlanRepository.findByManagerIdOrderByCreatedAtDesc(managerId);
        if (plans.isEmpty()) return List.of();
        Set<Integer> empIds = new java.util.HashSet<>();
        for (ContinuityPlan p : plans) {
            empIds.add(p.getEmployeeId());
            if (p.getBackupEmployeeId() != null) empIds.add(p.getBackupEmployeeId());
        }
        List<Employee> emps = new ArrayList<>();
        employeeRepository.findAllById(empIds).forEach(emps::add);
        Map<Integer, Employee> empById = emps.stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e, (a, b) -> a));
        return plans.stream().map(plan -> {
            ContinuityPlanResultDTO dto = new ContinuityPlanResultDTO();
            dto.setPlanId(plan.getPlanId());
            dto.setRequestId(plan.getRequestId());
            dto.setEmployeeId(plan.getEmployeeId());
            dto.setBackupEmployeeId(plan.getBackupEmployeeId());
            dto.setStatus(plan.getPlanStatus());
            dto.setNotes(plan.getNotes());
            dto.setCreatedAt(plan.getCreatedAt());
            Employee emp = empById.get(plan.getEmployeeId());
            dto.setEmployeeName(emp != null ? resolveEmployeeName(emp, plan.getEmployeeId()) : "Employé #" + plan.getEmployeeId());
            if (plan.getBackupEmployeeId() != null) {
                Employee backup = empById.get(plan.getBackupEmployeeId());
                dto.setBackupEmployeeName(backup != null
                        ? resolveEmployeeName(backup, plan.getBackupEmployeeId())
                        : "Employé #" + plan.getBackupEmployeeId());
            }
            return dto;
        }).toList();
    }

    // ── leave_requests data fetchers (source of truth) ─────────────────────

    /**
     * Returns leave_requests rows for a team's members that overlap the given period.
     * Maps each row into an AbsenceRequest object so all existing helper methods work unchanged.
     */
    private List<AbsenceRequest> fetchTeamLeaveRequestsForPeriod(
            List<Integer> teamIds, Integer managerId, LocalDate periodStart, LocalDate periodEnd) {
        if (teamIds.isEmpty()) return List.of();
        String placeholders = teamIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql = "SELECT id, employee_id, type, status, start_date, end_date, notes, requested_at, reviewed_at " +
                     "FROM leave_requests " +
                     "WHERE employee_id IN (" + placeholders + ") " +
                     "AND status NOT IN ('cancelled') " +
                     "AND start_date <= ? AND end_date >= ? " +
                     "ORDER BY start_date ASC";
        List<Object> params = new ArrayList<>(teamIds);
        params.add(periodEnd);
        params.add(periodStart);
        return jdbc.query(sql, (rs, rowNum) -> mapLeaveRow(rs, managerId), params.toArray());
    }

    /**
     * Computes absence rate from attendance table only:
     *   absent rows (is_present=false) / total rows × 100
     * Scoped to teamIds and the given date range.
     */
    private double computeAttendanceRate(List<Integer> teamIds, LocalDate start, LocalDate end) {
        if (teamIds.isEmpty()) return 0.0;
        String plh = teamIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql =
            "SELECT COUNT(*) FILTER (WHERE is_present = false) AS absent, COUNT(*) AS total" +
            " FROM attendance" +
            " WHERE employee_id IN (" + plh + ")" +
            " AND attendance_date BETWEEN ? AND ?" +
            " AND EXTRACT(DOW FROM attendance_date) NOT IN (0, 6)";
        List<Object> params = new ArrayList<>(teamIds);
        params.add(start);
        params.add(end);
        Double result = jdbc.queryForObject(sql, (rs, rn) -> {
            long absent = rs.getLong("absent");
            long total  = rs.getLong("total");
            return total == 0 ? 0.0 : (absent * 100.0 / total);
        }, params.toArray());
        return result != null ? result : 0.0;
    }

    /**
     * Counts unique (employee_id, day) absence pairs for the team within [start, end],
     * merging both sources to avoid double-counting:
     *   - attendance rows where is_present = false
     *   - approved leave_requests (expanded day-by-day via generate_series)
     */
    private int countTeamAbsenceDaysUnion(List<Integer> teamIds, LocalDate start, LocalDate end) {
        if (teamIds.isEmpty()) return 0;
        String plh = teamIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql =
            "SELECT COUNT(*) FROM (" +
            "  SELECT employee_id, attendance_date AS d" +
            "  FROM attendance" +
            "  WHERE employee_id IN (" + plh + ")" +
            "  AND attendance_date BETWEEN ? AND ?" +
            "  AND is_present = false" +
            "  UNION" +
            "  SELECT lr.employee_id, gs::date AS d" +
            "  FROM leave_requests lr," +
            "  LATERAL generate_series(GREATEST(lr.start_date, ?::date), LEAST(lr.end_date, ?::date), '1 day'::interval) gs" +
            "  WHERE lr.employee_id IN (" + plh + ")" +
            "  AND lr.status IN ('approuvee', 'approved')" +
            "  AND lr.start_date <= ? AND lr.end_date >= ?" +
            ") combined";
        List<Object> params = new ArrayList<>();
        params.addAll(teamIds);   // attendance IN
        params.add(start);
        params.add(end);
        params.add(start);        // GREATEST arg
        params.add(end);          // LEAST arg
        params.addAll(teamIds);   // leave_requests IN
        params.add(end);          // start_date <= end
        params.add(start);        // end_date >= start
        Integer count = jdbc.queryForObject(sql, Integer.class, params.toArray());
        return count != null ? count : 0;
    }

    /** Returns all non-cancelled leave_requests for the team, ordered by requested_at desc. */
    private List<AbsenceRequest> fetchTeamLeaveRequestsAll(List<Integer> teamIds, Integer managerId) {
        if (teamIds.isEmpty()) return List.of();
        String placeholders = teamIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql = "SELECT id, employee_id, type, status, start_date, end_date, notes, requested_at, reviewed_at " +
                     "FROM leave_requests " +
                     "WHERE employee_id IN (" + placeholders + ") " +
                     "AND status != 'cancelled' " +
                     "ORDER BY requested_at DESC NULLS LAST";
        return jdbc.query(sql, (rs, rowNum) -> mapLeaveRow(rs, managerId), teamIds.toArray());
    }

    /**
     * Looks up a single leave_request by id and verifies the employee belongs to the manager's team.
     * Returns null if not found or out of scope.
     */
    private AbsenceRequest resolveLeaveRequestForManager(Long requestId, Integer managerId) {
        List<AbsenceRequest> results = jdbc.query(
                "SELECT lr.id, lr.employee_id, lr.type, lr.status, lr.start_date, lr.end_date, " +
                "lr.notes, lr.requested_at, lr.reviewed_at " +
                "FROM leave_requests lr " +
                "JOIN employees e ON e.employee_id = lr.employee_id " +
                "WHERE lr.id = ? AND (e.manager_id = ? OR e.employee_id = ?)",
                (rs, rowNum) -> mapLeaveRow(rs, managerId),
                requestId, managerId, managerId);
        return results.isEmpty() ? null : results.get(0);
    }

    /** Maps a leave_requests ResultSet row to an AbsenceRequest object (not persisted). */
    private AbsenceRequest mapLeaveRow(ResultSet rs, Integer managerId) throws SQLException {
        AbsenceRequest ar = new AbsenceRequest();
        ar.setRequestId(rs.getLong("id"));
        ar.setEmployeeId(rs.getInt("employee_id"));
        ar.setManagerId(managerId);
        ar.setAbsenceType(rs.getString("type"));
        ar.setStatus(rs.getString("status"));
        ar.setStartDate(rs.getDate("start_date").toLocalDate());
        ar.setEndDate(rs.getDate("end_date").toLocalDate());
        ar.setReason(rs.getString("notes"));
        Timestamp requestedAt = rs.getTimestamp("requested_at");
        if (requestedAt != null) ar.setRequestedAt(requestedAt.toLocalDateTime());
        Timestamp reviewedAt = rs.getTimestamp("reviewed_at");
        if (reviewedAt != null) ar.setDecidedAt(reviewedAt.toLocalDateTime());
        ar.setContinuityRequired(Boolean.FALSE);
        return ar;
    }

    private List<ManagerAdvancedAbsenceDashboardDTO.CalendarAbsenceDTO> mapCalendarAbsences(
            List<AbsenceRequest> requests,
            Map<Integer, Employee> employeeById,
            Map<Integer, EmployeeCoverageProfile> profileByEmployeeId,
            Set<Long> coveredRequestIds,
            Map<Long, String> backupNameByRequestId) {
        return requests.stream().map((request) -> {
            ManagerAdvancedAbsenceDashboardDTO.CalendarAbsenceDTO item = new ManagerAdvancedAbsenceDashboardDTO.CalendarAbsenceDTO();
            Employee employee = employeeById.get(request.getEmployeeId());
            EmployeeCoverageProfile profile = profileByEmployeeId.get(request.getEmployeeId());
            item.setRequestId(request.getRequestId());
            item.setEmployeeId(request.getEmployeeId());
            item.setEmployeeName(resolveEmployeeName(employee, request.getEmployeeId()));
            item.setRoleLabel(resolveRoleLabel(profile, employee));
            item.setAbsenceType(normalizeAbsenceType(request.getAbsenceType()));
            item.setStatus(normalizeStatus(request.getStatus()));
            item.setStartDate(request.getStartDate());
            item.setEndDate(request.getEndDate());
            item.setCriticalRole(profile != null && Boolean.TRUE.equals(profile.getCriticalRole()));
            item.setBackupAssigned(coveredRequestIds.contains(request.getRequestId()));
            item.setBackupEmployeeName(backupNameByRequestId.get(request.getRequestId()));
            return item;
        }).toList();
    }

    private List<ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO> buildCoverageAlerts(
            List<AbsenceRequest> approvedRequests,
            Map<Integer, Employee> employeeById,
            Map<Integer, EmployeeCoverageProfile> profileByEmployeeId,
            LocalDate periodStart,
            LocalDate periodEnd,
            int threshold) {
        List<ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO> alerts = new ArrayList<>();

        for (LocalDate cursor = periodStart; !cursor.isAfter(periodEnd); cursor = cursor.plusDays(1)) {
            LocalDate day = cursor;
            int simultaneous = (int) approvedRequests.stream()
                    .filter(request -> FULL_ABSENCE_TYPES.contains(normalizeAbsenceType(request.getAbsenceType())))
                    .filter(request -> overlaps(request.getStartDate(), request.getEndDate(), day, day))
                    .count();
            if (simultaneous > threshold) {
                ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO alert = new ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO();
                alert.setAlertType("coverage_threshold");
                alert.setSeverity(simultaneous >= threshold + 2 ? "critical" : "warning");
                alert.setTitle("seuil d'absence simultanée dépassé");
                alert.setDescription("nombre d'absences simultanées: " + simultaneous + " (seuil: " + threshold + ")");
                alert.setDay(day);
                alert.setImpactedCount(simultaneous);
                alerts.add(alert);
            }
        }

        for (AbsenceRequest request : approvedRequests) {
            EmployeeCoverageProfile profile = profileByEmployeeId.get(request.getEmployeeId());
            if (profile == null || !Boolean.TRUE.equals(profile.getCriticalRole())) {
                continue;
            }
            Employee employee = employeeById.get(request.getEmployeeId());
            ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO alert = new ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO();
            alert.setAlertType("critical_role");
            alert.setSeverity("critical");
            alert.setTitle("absence sur rôle critique");
            alert.setDescription(resolveEmployeeName(employee, request.getEmployeeId()) + " (" + resolveRoleLabel(profile, employee)
                    + ") absent du " + request.getStartDate() + " au " + request.getEndDate());
            alert.setDay(request.getStartDate());
            alert.setRequestId(request.getRequestId());
            alert.setImpactedCount(1);
            alerts.add(alert);
        }

        return alerts.stream()
                .sorted(Comparator
                        .comparing((ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO alert) -> severityRank(alert.getSeverity()))
                        .thenComparing(ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO::getDay, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    private List<ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO> buildProjectImpacts(
            Integer managerId, List<Integer> teamIds, Map<Integer, Employee> employeeById,
            Set<Long> coveredRequestIds, Map<Long, String> backupNameByRequestId) {
        LocalDate today = LocalDate.now();
        List<TeamObjective> objectives = teamObjectiveRepository.findByManagerEmployeeIdOrderByDueDateAsc(managerId)
                .stream()
                .filter(objective -> isActiveObjective(objective, today))
                .toList();
        if (objectives.isEmpty()) return List.of();

        // Fetch all approved absences for the team (not period-limited — we filter by 15-day window per objective)
        List<AbsenceRequest> allApproved = fetchApprovedAbsencesForTeam(teamIds, managerId);
        if (allApproved.isEmpty()) return List.of();

        Map<Integer, List<AbsenceRequest>> requestsByEmployee =
                allApproved.stream().collect(Collectors.groupingBy(AbsenceRequest::getEmployeeId));

        // Pre-load members for all TEAM-scope objectives in one query
        List<Long> teamScopeIds = objectives.stream()
                .filter(o -> "TEAM".equalsIgnoreCase(o.getObjectiveScope()))
                .map(TeamObjective::getObjectiveId)
                .toList();
        Map<Long, List<Integer>> memberIdsByObjectiveId = new java.util.HashMap<>();
        if (!teamScopeIds.isEmpty()) {
            teamObjectiveMemberRepository.findByObjectiveIdIn(teamScopeIds).forEach(m ->
                    memberIdsByObjectiveId.computeIfAbsent(m.getObjectiveId(), k -> new ArrayList<>()).add(m.getEmployeeId()));
        }

        List<ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO> impacts = new ArrayList<>();

        for (TeamObjective objective : objectives) {
            LocalDate windowStart = objective.getDueDate().minusDays(15);
            LocalDate windowEnd = objective.getDueDate();

            boolean isTeam = "TEAM".equalsIgnoreCase(objective.getObjectiveScope());
            List<Integer> relevantIds;
            if (isTeam) {
                List<Integer> members = memberIdsByObjectiveId.getOrDefault(objective.getObjectiveId(), List.of());
                relevantIds = members.isEmpty() ? List.of(objective.getOwnerEmployeeId()) : members;
            } else {
                relevantIds = List.of(objective.getOwnerEmployeeId());
            }
            int totalMembers = relevantIds.size();

            List<ManagerAdvancedAbsenceDashboardDTO.AffectedMemberDTO> affectedMembers = new ArrayList<>();
            Long firstRelatedRequestId = null;

            for (Integer empId : relevantIds) {
                for (AbsenceRequest request : requestsByEmployee.getOrDefault(empId, List.of())) {
                    if (!overlaps(request.getStartDate(), request.getEndDate(), windowStart, windowEnd)) continue;
                    ManagerAdvancedAbsenceDashboardDTO.AffectedMemberDTO member =
                            new ManagerAdvancedAbsenceDashboardDTO.AffectedMemberDTO();
                    member.setEmployeeId(empId);
                    member.setEmployeeName(resolveEmployeeName(employeeById.get(empId), empId));
                    member.setAbsenceStart(request.getStartDate());
                    member.setAbsenceEnd(request.getEndDate());
                    member.setAbsenceType(normalizeAbsenceType(request.getAbsenceType()));
                    if (firstRelatedRequestId == null) firstRelatedRequestId = request.getRequestId();
                    affectedMembers.add(member);
                    break; // one impact entry per team member
                }
            }

            if (affectedMembers.isEmpty()) continue;

            int affectedCount = affectedMembers.size();
            double capacityRisk = totalMembers > 0 ? Math.round((affectedCount * 1000.0 / totalMembers)) / 10.0 : 0.0;

            ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO item = new ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO();
            item.setObjectiveId(objective.getObjectiveId());
            item.setObjectiveCode(objective.getObjectiveCode());
            item.setObjectiveTitle(objective.getTitle());
            item.setItemType(isTeam ? "projet" : "tache");
            item.setRiskStatus(clean(objective.getRiskStatus()));
            item.setOwnerName(resolveEmployeeName(
                    employeeById.get(objective.getOwnerEmployeeId()), objective.getOwnerEmployeeId()));
            item.setRelatedRequestId(firstRelatedRequestId);
            item.setAbsenceStart(affectedMembers.get(0).getAbsenceStart());
            item.setAbsenceEnd(affectedMembers.get(0).getAbsenceEnd());
            item.setImpactReason(isTeam
                    ? "absence d'un ou plusieurs membres pendant la fenêtre d'échéance"
                    : "échéance pendant l'absence du propriétaire");
            item.setProgressPercent(objective.getProgressPercent() != null
                    ? objective.getProgressPercent().intValue() : 0);
            item.setDelayDays(objective.getDelayDays() != null ? objective.getDelayDays() : 0);
            item.setDueDate(objective.getDueDate());
            item.setAffectedMembersCount(affectedCount);
            item.setTotalMembersCount(totalMembers);
            item.setCapacityRiskPercent(capacityRisk);
            item.setAffectedMembers(affectedMembers);
            item.setBackupAssigned(firstRelatedRequestId != null && coveredRequestIds.contains(firstRelatedRequestId));
            item.setBackupName(firstRelatedRequestId != null ? backupNameByRequestId.get(firstRelatedRequestId) : null);
            impacts.add(item);
        }

        return impacts.stream()
                .sorted(Comparator
                        .comparing(ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO::getRiskStatus, Comparator.nullsLast(String::compareTo))
                        .thenComparing(ManagerAdvancedAbsenceDashboardDTO.ProjectImpactDTO::getAbsenceStart, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
    }

    /** Fetches all approved leave_requests for the given employee list (no period filter). */
    private List<AbsenceRequest> fetchApprovedAbsencesForTeam(List<Integer> teamIds, Integer managerId) {
        if (teamIds.isEmpty()) return List.of();
        String placeholders = teamIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql = "SELECT id, employee_id, type, status, start_date, end_date, notes, requested_at, reviewed_at " +
                     "FROM leave_requests " +
                     "WHERE employee_id IN (" + placeholders + ") " +
                     "AND status IN ('approuvee', 'approved') " +
                     "ORDER BY start_date ASC";
        return jdbc.query(sql, (rs, rowNum) -> mapLeaveRow(rs, managerId), teamIds.toArray());
    }

    private ManagerAdvancedAbsenceDashboardDTO.RequestPipelineDTO buildPipeline(
            List<Integer> teamIds, Integer managerId, Map<Integer, Employee> employeeById,
            List<ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO> coverageAlerts) {
        Set<Long> alertedRequestIds = coverageAlerts.stream()
                .filter(alert -> alert.getRequestId() != null)
                .map(ManagerAdvancedAbsenceDashboardDTO.CoverageAlertDTO::getRequestId)
                .collect(Collectors.toSet());
        List<AbsenceRequest> allRequests = fetchTeamLeaveRequestsAll(teamIds, managerId);
        List<AbsenceRequest> latest = allRequests.stream().limit(20).toList();

        ManagerAdvancedAbsenceDashboardDTO.RequestPipelineDTO pipeline = new ManagerAdvancedAbsenceDashboardDTO.RequestPipelineDTO();
        pipeline.setPendingCount((int) allRequests.stream().filter(request -> isPending(request.getStatus())).count());
        pipeline.setApprovedCount((int) allRequests.stream().filter(request -> isApproved(request.getStatus())).count());
        pipeline.setRefusedCount((int) allRequests.stream().filter(request -> isRefused(request.getStatus())).count());
        pipeline.setRequests(latest.stream().map((request) -> {
            ManagerAdvancedAbsenceDashboardDTO.PipelineRequestDTO dto = new ManagerAdvancedAbsenceDashboardDTO.PipelineRequestDTO();
            dto.setRequestId(request.getRequestId());
            dto.setEmployeeId(request.getEmployeeId());
            dto.setEmployeeName(resolveEmployeeName(employeeById.get(request.getEmployeeId()), request.getEmployeeId()));
            dto.setAbsenceType(normalizeAbsenceType(request.getAbsenceType()));
            dto.setStatus(normalizeStatus(request.getStatus()));
            dto.setStartDate(request.getStartDate());
            dto.setEndDate(request.getEndDate());
            dto.setReason(clean(request.getReason()));
            dto.setRequestedAt(request.getRequestedAt());
            dto.setConflictsDetected(alertedRequestIds.contains(request.getRequestId()));
            return dto;
        }).toList());
        return pipeline;
    }

    private List<ManagerAdvancedAbsenceDashboardDTO.EmployeeChoiceDTO> mapBackupChoices(
            List<Employee> teamMembers, Map<Integer, EmployeeCoverageProfile> profileByEmployeeId) {
        return teamMembers.stream()
                .sorted(Comparator.comparing((Employee employee) -> clean(employee.getFirstName()))
                        .thenComparing(employee -> clean(employee.getLastName())))
                .map((employee) -> {
                    EmployeeCoverageProfile profile = profileByEmployeeId.get(employee.getEmployeeId());
                    ManagerAdvancedAbsenceDashboardDTO.EmployeeChoiceDTO dto =
                            new ManagerAdvancedAbsenceDashboardDTO.EmployeeChoiceDTO();
                    dto.setEmployeeId(employee.getEmployeeId());
                    dto.setEmployeeName(resolveEmployeeName(employee, employee.getEmployeeId()));
                    dto.setRoleLabel(resolveRoleLabel(profile, employee));
                    return dto;
                }).toList();
    }

    private int maxSimultaneous(List<AbsenceRequest> requests, LocalDate startDate, LocalDate endDate) {
        int max = 0;
        for (LocalDate cursor = startDate; !cursor.isAfter(endDate); cursor = cursor.plusDays(1)) {
            LocalDate day = cursor;
            int current = (int) requests.stream()
                    .filter(request -> FULL_ABSENCE_TYPES.contains(normalizeAbsenceType(request.getAbsenceType())))
                    .filter(request -> overlaps(request.getStartDate(), request.getEndDate(), day, day))
                    .count();
            if (current > max) {
                max = current;
            }
        }
        return max;
    }

    private boolean overlaps(LocalDate startA, LocalDate endA, LocalDate startB, LocalDate endB) {
        if (startA == null || endA == null || startB == null || endB == null) {
            return false;
        }
        return !(endA.isBefore(startB) || startA.isAfter(endB));
    }

    private int severityRank(String severity) {
        if ("critical".equalsIgnoreCase(severity)) return 0;
        if ("warning".equalsIgnoreCase(severity)) return 1;
        return 2;
    }

    private String normalizeViewMode(String viewModeRaw) {
        String raw = clean(viewModeRaw).toLowerCase();
        if ("weekly".equals(raw)) return "weekly";
        return "monthly";
    }

    private String normalizeAbsenceType(String rawType) {
        String normalized = clean(rawType).toLowerCase();
        if (normalized.isBlank()) return "conge-paye";
        if (Set.of("conge-paye", "maladie", "sans-solde", "evenement-familial", "autre").contains(normalized)) return normalized;
        return "conge-paye";
    }

    private String normalizeStatus(String rawStatus) {
        String normalized = clean(rawStatus).toLowerCase();
        if (isApproved(normalized)) return "approuvee";
        if (isPending(normalized)) return "en_attente";
        if (isRefused(normalized)) return "refusee";
        return "en_attente";
    }

    private boolean isApproved(String rawStatus) {
        return APPROVED_STATUSES.contains(clean(rawStatus).toLowerCase());
    }

    /** En cours = échéance non dépassée et progression < 100 %. Les objectifs échus sont ignorés
     * (alignement avec ManagerCrossAnalysisService#isActiveForAnalysis). */
    private boolean isActiveObjective(TeamObjective objective, LocalDate today) {
        if (objective.getDueDate() == null || objective.getDueDate().isBefore(today)) {
            return false;
        }
        int progress = objective.getProgressPercent() != null ? objective.getProgressPercent().intValue() : 0;
        return progress < 100;
    }

    private boolean isPending(String rawStatus) {
        return PENDING_STATUSES.contains(clean(rawStatus).toLowerCase());
    }

    private boolean isRefused(String rawStatus) {
        return REFUSED_STATUSES.contains(clean(rawStatus).toLowerCase());
    }

    private String resolveEmployeeName(Employee employee, Integer fallbackEmployeeId) {
        if (employee == null) {
            return fallbackEmployeeId == null ? "employe" : "employe #" + fallbackEmployeeId;
        }
        String fullName = (clean(employee.getFirstName()) + " " + clean(employee.getLastName())).trim();
        if (fullName.isBlank()) {
            return "employe #" + employee.getEmployeeId();
        }
        return fullName;
    }

    private String resolveRoleLabel(EmployeeCoverageProfile profile, Employee employee) {
        if (profile != null && !clean(profile.getRoleLabel()).isBlank()) {
            return clean(profile.getRoleLabel());
        }
        if (employee != null && !clean(employee.getJobTitle()).isBlank()) {
            return clean(employee.getJobTitle());
        }
        return "role non défini";
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
