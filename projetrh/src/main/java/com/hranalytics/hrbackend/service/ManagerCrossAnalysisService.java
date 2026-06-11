package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.ManagerCrossAnalysisDTO;
import com.hranalytics.hrbackend.entity.AbsenceRequest;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.TeamObjective;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveMemberRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveRepository;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Cross-module service: computes which OKR objectives are at capacity risk
 * because one or more responsible members have an approved absence within
 * the 15-day window before the objective's due date.
 */
@Service
public class ManagerCrossAnalysisService {

    private static final Set<String> ABSENCE_TYPES = Set.of(
            "conge-paye", "maladie", "sans-solde", "evenement-familial", "autre");

    private final TeamObjectiveRepository teamObjectiveRepository;
    private final TeamObjectiveMemberRepository teamObjectiveMemberRepository;
    private final EmployeeRepository employeeRepository;
    private final JdbcTemplate jdbc;

    public ManagerCrossAnalysisService(
            TeamObjectiveRepository teamObjectiveRepository,
            TeamObjectiveMemberRepository teamObjectiveMemberRepository,
            EmployeeRepository employeeRepository,
            JdbcTemplate jdbc) {
        this.teamObjectiveRepository = teamObjectiveRepository;
        this.teamObjectiveMemberRepository = teamObjectiveMemberRepository;
        this.employeeRepository = employeeRepository;
        this.jdbc = jdbc;
    }

    public ManagerCrossAnalysisDTO getCrossAnalysis(Integer managerId) {
        // 1. Load team members
        List<Employee> teamMembers = employeeRepository.findByManagerIdOrEmployeeId(managerId, managerId);
        Map<Integer, Employee> employeeById = teamMembers.stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e, (a, b) -> a));
        List<Integer> teamIds = new ArrayList<>(employeeById.keySet());

        // 2. Load objectives for this manager
        List<TeamObjective> objectives = teamObjectiveRepository.findByManagerEmployeeIdOrderByDueDateAsc(managerId);
        if (objectives.isEmpty()) {
            ManagerCrossAnalysisDTO empty = new ManagerCrossAnalysisDTO();
            empty.setObjectiveAbsenceImpacts(List.of());
            return empty;
        }

        // 3. Fetch all approved absences for the team
        List<AbsenceRequest> approvedAbsences = fetchApprovedAbsences(teamIds, managerId);
        Map<Integer, List<AbsenceRequest>> requestsByEmployee = approvedAbsences.stream()
                .collect(Collectors.groupingBy(AbsenceRequest::getEmployeeId));

        // 4. Pre-load members for TEAM-scope objectives in one batch query
        List<Long> teamScopeIds = objectives.stream()
                .filter(o -> "TEAM".equalsIgnoreCase(o.getObjectiveScope()))
                .map(TeamObjective::getObjectiveId)
                .toList();
        Map<Long, List<Integer>> memberIdsByObjectiveId = new java.util.HashMap<>();
        if (!teamScopeIds.isEmpty()) {
            teamObjectiveMemberRepository.findByObjectiveIdIn(teamScopeIds).forEach(m ->
                    memberIdsByObjectiveId.computeIfAbsent(m.getObjectiveId(), k -> new ArrayList<>())
                            .add(m.getEmployeeId()));
        }

        // 5. Build impact list
        List<ManagerCrossAnalysisDTO.ObjectiveAbsenceImpactDTO> impacts = new ArrayList<>();

        LocalDate today = LocalDate.now();

        for (TeamObjective objective : objectives) {
            if (!isActiveForAnalysis(objective, today)) {
                continue;
            }

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

            List<ManagerCrossAnalysisDTO.AffectedMemberDTO> affectedMembers = new ArrayList<>();
            for (Integer empId : relevantIds) {
                for (AbsenceRequest req : requestsByEmployee.getOrDefault(empId, List.of())) {
                    if (!overlaps(req.getStartDate(), req.getEndDate(), windowStart, windowEnd)) continue;
                    ManagerCrossAnalysisDTO.AffectedMemberDTO member = new ManagerCrossAnalysisDTO.AffectedMemberDTO();
                    Employee emp = employeeById.get(empId);
                    member.setEmployeeId(empId);
                    member.setEmployeeName(resolveEmployeeName(emp, empId));
                    member.setAbsenceStart(req.getStartDate());
                    member.setAbsenceEnd(req.getEndDate());
                    member.setAbsenceType(normalizeAbsenceType(req.getAbsenceType()));
                    member.setRelatedRequestId(req.getRequestId());
                    affectedMembers.add(member);
                    break; // one impact entry per member
                }
            }

            if (affectedMembers.isEmpty()) continue;

            double capacityRisk = Math.round((affectedMembers.size() * 1000.0 / totalMembers)) / 10.0;

            ManagerCrossAnalysisDTO.ObjectiveAbsenceImpactDTO dto = new ManagerCrossAnalysisDTO.ObjectiveAbsenceImpactDTO();
            dto.setObjectiveId(objective.getObjectiveId());
            dto.setObjectiveCode(objective.getObjectiveCode());
            dto.setObjectiveTitle(objective.getTitle());
            dto.setDueDate(objective.getDueDate());
            dto.setProgressPercent(objective.getProgressPercent() != null
                    ? objective.getProgressPercent().intValue() : 0);
            dto.setDelayDays(objective.getDelayDays() != null ? objective.getDelayDays() : 0);
            dto.setRiskStatus(objective.getRiskStatus());
            dto.setScope(objective.getObjectiveScope());
            dto.setTotalMembers(totalMembers);
            dto.setAffectedMembersCount(affectedMembers.size());
            dto.setCapacityRiskPercent(capacityRisk);
            dto.setAffectedMembers(affectedMembers);
            impacts.add(dto);
        }

        ManagerCrossAnalysisDTO result = new ManagerCrossAnalysisDTO();
        result.setObjectiveAbsenceImpacts(impacts);
        return result;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** En cours = échéance non dépassée et progression &lt; 100 %. Les échus sont ignorés. */
    private boolean isActiveForAnalysis(TeamObjective objective, LocalDate today) {
        if (objective.getDueDate() == null || objective.getDueDate().isBefore(today)) {
            return false;
        }
        int progress = objective.getProgressPercent() != null
                ? objective.getProgressPercent().intValue()
                : 0;
        return progress < 100;
    }

    private boolean overlaps(LocalDate s1, LocalDate e1, LocalDate s2, LocalDate e2) {
        if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
        return !(e1.isBefore(s2) || s1.isAfter(e2));
    }

    private String resolveEmployeeName(Employee emp, Integer fallback) {
        if (emp == null) return "Employé #" + fallback;
        String name = (clean(emp.getFirstName()) + " " + clean(emp.getLastName())).trim();
        return name.isBlank() ? "Employé #" + fallback : name;
    }

    private String normalizeAbsenceType(String raw) {
        String normalized = clean(raw).toLowerCase();
        return ABSENCE_TYPES.contains(normalized) ? normalized : "autre";
    }

    private String clean(String v) {
        return v == null ? "" : v.trim();
    }

    private List<AbsenceRequest> fetchApprovedAbsences(List<Integer> employeeIds, Integer managerId) {
        if (employeeIds.isEmpty()) return List.of();
        String placeholders = employeeIds.stream().map(id -> "?").collect(Collectors.joining(","));
        String sql = "SELECT id, employee_id, type, status, start_date, end_date, notes, requested_at, reviewed_at " +
                     "FROM leave_requests " +
                     "WHERE employee_id IN (" + placeholders + ") " +
                     "AND status IN ('approuvee', 'approved') " +
                     "ORDER BY start_date ASC";
        return jdbc.query(sql, (rs, rowNum) -> {
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
            ar.setContinuityRequired(Boolean.FALSE);
            return ar;
        }, employeeIds.toArray());
    }
}
