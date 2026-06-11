package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.CreateObjectiveActionPlanDTO;
import com.hranalytics.hrbackend.dto.CreateTeamObjectiveDTO;
import com.hranalytics.hrbackend.dto.ManagerObjectiveDTO;
import com.hranalytics.hrbackend.dto.ManagerObjectiveMilestoneDTO;
import com.hranalytics.hrbackend.dto.ManagerOkrDashboardDTO;
import com.hranalytics.hrbackend.dto.ObjectiveProgressUpdateDTO;
import com.hranalytics.hrbackend.dto.UpdateTeamObjectiveDTO;
import com.hranalytics.hrbackend.dto.OkrCommitImportRequestDTO;
import com.hranalytics.hrbackend.dto.OkrImportPreviewResultDTO;
import com.hranalytics.hrbackend.dto.OkrImportRowDTO;
import com.hranalytics.hrbackend.dto.OkrImportSummaryDTO;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.ObjectiveActionPlan;
import com.hranalytics.hrbackend.entity.ObjectiveDependency;
import com.hranalytics.hrbackend.entity.ObjectiveMilestone;
import com.hranalytics.hrbackend.entity.ObjectiveProgressUpdate;
import com.hranalytics.hrbackend.entity.TeamObjective;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.ObjectiveActionPlanRepository;
import com.hranalytics.hrbackend.repository.ObjectiveDependencyRepository;
import com.hranalytics.hrbackend.repository.ObjectiveMilestoneRepository;
import com.hranalytics.hrbackend.repository.ObjectiveProgressUpdateRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveMemberRepository;
import com.hranalytics.hrbackend.entity.TeamObjectiveMember;
import com.hranalytics.hrbackend.util.ObjectiveRiskCalculator;
import com.hranalytics.hrbackend.util.ObjectiveRiskCalculator.RiskEvaluation;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManagerOkrService {

    private final TeamObjectiveRepository teamObjectiveRepository;
    private final ObjectiveDependencyRepository objectiveDependencyRepository;
    private final ObjectiveMilestoneRepository objectiveMilestoneRepository;
    private final ObjectiveProgressUpdateRepository objectiveProgressUpdateRepository;
    private final ObjectiveActionPlanRepository objectiveActionPlanRepository;
    private final EmployeeRepository employeeRepository;
    private final TeamObjectiveMemberRepository teamObjectiveMemberRepository;

    public ManagerOkrService(
            TeamObjectiveRepository teamObjectiveRepository,
            ObjectiveDependencyRepository objectiveDependencyRepository,
            ObjectiveMilestoneRepository objectiveMilestoneRepository,
            ObjectiveProgressUpdateRepository objectiveProgressUpdateRepository,
            ObjectiveActionPlanRepository objectiveActionPlanRepository,
            EmployeeRepository employeeRepository,
            TeamObjectiveMemberRepository teamObjectiveMemberRepository) {
        this.teamObjectiveRepository = teamObjectiveRepository;
        this.objectiveDependencyRepository = objectiveDependencyRepository;
        this.objectiveMilestoneRepository = objectiveMilestoneRepository;
        this.objectiveProgressUpdateRepository = objectiveProgressUpdateRepository;
        this.objectiveActionPlanRepository = objectiveActionPlanRepository;
        this.employeeRepository = employeeRepository;
        this.teamObjectiveMemberRepository = teamObjectiveMemberRepository;
    }

    /** Returns all objectives across all managers — used by the RH dashboard. */
    public ManagerOkrDashboardDTO getAllObjectives() {
        List<TeamObjective> objectives = refreshRiskStatuses(teamObjectiveRepository.findAll());
        if (objectives.isEmpty()) {
            ManagerOkrDashboardDTO empty = new ManagerOkrDashboardDTO();
            empty.setObjectives(List.of());
            empty.setMilestones(List.of());
            return empty;
        }

        List<Long> objectiveIds = objectives.stream().map(TeamObjective::getObjectiveId).toList();
        Set<Integer> ownerIds = objectives.stream().map(TeamObjective::getOwnerEmployeeId).collect(Collectors.toSet());

        Map<Long, List<Integer>> membersByObjective = mapMembers(objectiveIds);
        Set<Integer> allEmployeeIds = new java.util.HashSet<>(ownerIds);
        membersByObjective.values().forEach(allEmployeeIds::addAll);
        // Also include manager employees so managerName can be resolved
        objectives.stream().map(TeamObjective::getManagerEmployeeId).filter(java.util.Objects::nonNull).forEach(allEmployeeIds::add);

        @SuppressWarnings("null")
        Map<Integer, Employee> employeeById =
                employeeRepository.findAllById(allEmployeeIds).stream()
                        .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));

        Map<Long, List<String>> dependenciesByObjective = mapDependencies(objectiveIds);
        List<ManagerObjectiveDTO> objectiveDtos =
                objectives.stream()
                        .map(o -> toObjectiveDto(o, employeeById.get(o.getOwnerEmployeeId()), dependenciesByObjective, membersByObjective, employeeById))
                        .toList();

        List<ObjectiveMilestone> milestones = objectiveMilestoneRepository.findByObjectiveIdInOrderByPlannedDateAsc(objectiveIds);
        Map<Long, TeamObjective> objectiveById =
                objectives.stream().collect(Collectors.toMap(TeamObjective::getObjectiveId, o -> o));
        List<ManagerObjectiveMilestoneDTO> milestoneDtos =
                milestones.stream()
                        .map(m -> toMilestoneDto(m, objectiveById, employeeById))
                        .toList();

        ManagerOkrDashboardDTO dashboard = new ManagerOkrDashboardDTO();
        dashboard.setObjectives(objectiveDtos);
        dashboard.setMilestones(milestoneDtos);
        return dashboard;
    }

    public ManagerOkrDashboardDTO getDashboard(Integer managerId) {
        List<TeamObjective> objectives =
                refreshRiskStatuses(teamObjectiveRepository.findByManagerEmployeeIdOrderByDueDateAsc(managerId));
        if (objectives.isEmpty()) {
            ManagerOkrDashboardDTO empty = new ManagerOkrDashboardDTO();
            empty.setObjectives(List.of());
            empty.setMilestones(List.of());
            return empty;
        }

        List<Long> objectiveIds = objectives.stream().map(TeamObjective::getObjectiveId).toList();
        Set<Integer> ownerIds = objectives.stream().map(TeamObjective::getOwnerEmployeeId).collect(Collectors.toSet());

        // Also collect member IDs from join table and the manager itself
        Map<Long, List<Integer>> membersByObjective = mapMembers(objectiveIds);
        Set<Integer> allEmployeeIds = new java.util.HashSet<>(ownerIds);
        membersByObjective.values().forEach(allEmployeeIds::addAll);
        allEmployeeIds.add(managerId);

        @SuppressWarnings("null")
        Map<Integer, Employee> employeeById =
                employeeRepository.findAllById(allEmployeeIds).stream()
                        .collect(Collectors.toMap(Employee::getEmployeeId, employee -> employee));

        Map<Long, List<String>> dependenciesByObjective = mapDependencies(objectiveIds);
        List<ManagerObjectiveDTO> objectiveDtos =
                objectives.stream()
                        .map((objective) -> toObjectiveDto(objective, employeeById.get(objective.getOwnerEmployeeId()), dependenciesByObjective, membersByObjective, employeeById))
                        .toList();

        List<ObjectiveMilestone> milestones = objectiveMilestoneRepository.findByObjectiveIdInOrderByPlannedDateAsc(objectiveIds);
        Map<Long, TeamObjective> objectiveById =
                objectives.stream().collect(Collectors.toMap(TeamObjective::getObjectiveId, objective -> objective));
        List<ManagerObjectiveMilestoneDTO> milestoneDtos =
                milestones.stream()
                        .map((milestone) -> toMilestoneDto(milestone, objectiveById, employeeById))
                        .toList();

        ManagerOkrDashboardDTO dashboard = new ManagerOkrDashboardDTO();
        dashboard.setObjectives(objectiveDtos);
        dashboard.setMilestones(milestoneDtos);
        return dashboard;
    }

    public ManagerObjectiveDTO createObjective(Integer managerId, CreateTeamObjectiveDTO payload) {
        if (payload == null || payload.getTitle() == null || payload.getTitle().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le titre de l'objectif est obligatoire.");
        }
        if (payload.getOwnerEmployeeId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le propriétaire est obligatoire.");
        }

        List<Integer> memberIds = resolveMemberIds(payload);

        for (Integer memberId : memberIds) {
            @SuppressWarnings("null")
            Employee member = employeeRepository.findById(memberId).orElse(null);
            if (member == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Employé introuvable : id=" + memberId);
            }
            if (!Objects.equals(member.getManagerId(), managerId) && !Objects.equals(member.getEmployeeId(), managerId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "L'employé " + memberId + " n'appartient pas à l'équipe du manager.");
            }
        }

        LocalDateTime now = LocalDateTime.now();
        Integer primaryOwnerId = memberIds.get(0);
        @SuppressWarnings("null")
        Employee primaryOwner = employeeRepository.findById(primaryOwnerId).orElseThrow();

        TeamObjective objective = new TeamObjective();
        objective.setObjectiveCode(clean(payload.getObjectiveCode(), generateCode(now)));
        objective.setTitle(payload.getTitle().trim());
        objective.setObjectiveScope(normalizeScope(payload.getObjectiveScope()));
        objective.setOwnerEmployeeId(primaryOwnerId);
        objective.setManagerEmployeeId(managerId);
        objective.setHorizonLabel(clean(payload.getHorizonLabel(), "N/A"));
        objective.setDueDate(payload.getDueDate() != null ? payload.getDueDate() : LocalDate.now().plusDays(30));
        objective.setProgressPercent(clampPercent(payload.getProgressPercent(), BigDecimal.ZERO));
        objective.setWeighting(clampPositive(payload.getWeighting(), new BigDecimal("1.00")));
        objective.setLastUpdateAt(now);
        objective.setCreatedAt(now);
        objective.setUpdatedAt(now);
        applyComputedRisk(objective, now.toLocalDate());
        TeamObjective saved = teamObjectiveRepository.save(objective);
        saveDependencies(saved.getObjectiveId(), payload.getDependencies(), now);

        for (Integer memberId : memberIds) {
            TeamObjectiveMember link = new TeamObjectiveMember();
            link.setObjectiveId(saved.getObjectiveId());
            link.setEmployeeId(memberId);
            teamObjectiveMemberRepository.save(link);
        }

        Map<Long, List<String>> dependencies = mapDependencies(List.of(saved.getObjectiveId()));
        Map<Long, List<Integer>> membersByObjective = mapMembers(List.of(saved.getObjectiveId()));
        Map<Integer, Employee> ownerMap = employeeRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));
        return toObjectiveDto(saved, primaryOwner, dependencies, membersByObjective, ownerMap);
    }

    private List<Integer> resolveMemberIds(CreateTeamObjectiveDTO payload) {
        boolean isTeamMulti = "TEAM".equalsIgnoreCase(payload.getObjectiveScope())
                && payload.getMemberEmployeeIds() != null
                && !payload.getMemberEmployeeIds().isEmpty();
        if (isTeamMulti) {
            return new ArrayList<>(payload.getMemberEmployeeIds());
        }
        return List.of(payload.getOwnerEmployeeId());
    }

    public ManagerObjectiveDTO updateObjectiveProgress(
            Integer managerId, Long objectiveId, ObjectiveProgressUpdateDTO payload) {
        TeamObjective objective =
                teamObjectiveRepository
                        .findByObjectiveIdAndManagerEmployeeId(objectiveId, managerId)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable."));

        BigDecimal progress = clampPercent(payload == null ? null : payload.getProgressPercent(), objective.getProgressPercent());
        Integer authorId =
                payload == null || payload.getAuthorEmployeeId() == null ? managerId : payload.getAuthorEmployeeId();

        LocalDateTime now = LocalDateTime.now();
        objective.setProgressPercent(progress);
        applyComputedRisk(objective, now.toLocalDate());
        objective.setLastUpdateAt(now);
        objective.setUpdatedAt(now);
        TeamObjective updated = teamObjectiveRepository.save(objective);

        ObjectiveProgressUpdate progressUpdate = new ObjectiveProgressUpdate();
        progressUpdate.setObjectiveId(objectiveId);
        progressUpdate.setAuthorEmployeeId(authorId);
        progressUpdate.setProgressPercent(progress);
        progressUpdate.setCommentText(payload == null ? null : clean(payload.getCommentText(), null));
        progressUpdate.setRiskStatus(updated.getRiskStatus());
        progressUpdate.setRiskReason(updated.getRiskReason());
        progressUpdate.setUpdatedAt(now);
        objectiveProgressUpdateRepository.save(progressUpdate);

        @SuppressWarnings("null")
        Employee owner = employeeRepository.findById(updated.getOwnerEmployeeId()).orElse(null);
        Map<Long, List<String>> dependencies = mapDependencies(List.of(updated.getObjectiveId()));
        Map<Long, List<Integer>> membersByObjective = mapMembers(List.of(updated.getObjectiveId()));
        List<Integer> memberIds = membersByObjective.getOrDefault(updated.getObjectiveId(), List.of(updated.getOwnerEmployeeId()));
        @SuppressWarnings("null")
        Map<Integer, Employee> ownerMap = employeeRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));
        return toObjectiveDto(updated, owner, dependencies, membersByObjective, ownerMap);
    }

    public void createActionPlan(Integer managerId, Long objectiveId, CreateObjectiveActionPlanDTO payload) {
        TeamObjective objective =
                teamObjectiveRepository
                        .findByObjectiveIdAndManagerEmployeeId(objectiveId, managerId)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable."));
        if (payload == null || payload.getTitle() == null || payload.getTitle().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le titre du plan d'action est obligatoire.");
        }

        ObjectiveActionPlan plan = new ObjectiveActionPlan();
        plan.setObjectiveId(objective.getObjectiveId());
        plan.setActionType(normalizeActionType(payload.getActionType()));
        plan.setTitle(payload.getTitle().trim());
        plan.setDetails(clean(payload.getDetails(), null));
        plan.setOwnerEmployeeId(payload.getOwnerEmployeeId());
        plan.setDueDate(payload.getDueDate());
        plan.setStatus(clean(payload.getStatus(), "OPEN"));
        plan.setCreatedAt(LocalDateTime.now());
        objectiveActionPlanRepository.save(plan);
    }

    private Map<Long, List<String>> mapDependencies(List<Long> objectiveIds) {
        if (objectiveIds == null || objectiveIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<ObjectiveDependency> dependencies = objectiveDependencyRepository.findByObjectiveIdIn(objectiveIds);
        Map<Long, List<String>> grouped = new LinkedHashMap<>();
        for (ObjectiveDependency dependency : dependencies) {
            if (!"OPEN".equalsIgnoreCase(dependency.getBlockingStatus())) {
                continue;
            }
            grouped.computeIfAbsent(dependency.getObjectiveId(), ignored -> new ArrayList<>());
            String label =
                    clean(dependency.getBlockingSource(), "Dépendance")
                            + (dependency.getBlockingTeam() == null || dependency.getBlockingTeam().isBlank()
                                    ? ""
                                    : " (" + dependency.getBlockingTeam().trim() + ")");
            grouped.get(dependency.getObjectiveId()).add(label);
        }
        return grouped;
    }

    private Map<Long, List<Integer>> mapMembers(List<Long> objectiveIds) {
        if (objectiveIds == null || objectiveIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<TeamObjectiveMember> members = teamObjectiveMemberRepository.findByObjectiveIdIn(objectiveIds);
        Map<Long, List<Integer>> grouped = new LinkedHashMap<>();
        for (TeamObjectiveMember m : members) {
            grouped.computeIfAbsent(m.getObjectiveId(), ignored -> new ArrayList<>()).add(m.getEmployeeId());
        }
        return grouped;
    }

    private void saveDependencies(Long objectiveId, List<String> dependencyLabels, LocalDateTime now) {
        if (dependencyLabels == null || dependencyLabels.isEmpty()) {
            return;
        }
        for (String dep : dependencyLabels) {
            if (dep == null || dep.isBlank()) {
                continue;
            }
            ObjectiveDependency dependency = new ObjectiveDependency();
            dependency.setObjectiveId(objectiveId);
            dependency.setBlockingSource(dep.trim());
            dependency.setBlockingStatus("OPEN");
            dependency.setCreatedAt(now);
            objectiveDependencyRepository.save(dependency);
        }
    }

    private ManagerObjectiveDTO toObjectiveDto(
            TeamObjective objective, Employee owner, Map<Long, List<String>> dependenciesByObjective,
            Map<Long, List<Integer>> membersByObjective, Map<Integer, Employee> employeeById) {
        ManagerObjectiveDTO dto = new ManagerObjectiveDTO();
        dto.setObjectiveId(objective.getObjectiveId());
        dto.setObjectiveCode(objective.getObjectiveCode());
        dto.setTitle(objective.getTitle());
        dto.setObjectiveScope(objective.getObjectiveScope());
        dto.setOwnerEmployeeId(objective.getOwnerEmployeeId());
        dto.setOwnerName(formatOwnerName(owner, objective.getOwnerEmployeeId()));
        dto.setManagerId(objective.getManagerEmployeeId());
        Employee manager = employeeById.get(objective.getManagerEmployeeId());
        dto.setManagerName(formatOwnerName(manager, objective.getManagerEmployeeId()));

        // Populate multi-owner member lists
        List<Integer> memberIds = membersByObjective.getOrDefault(objective.getObjectiveId(), List.of(objective.getOwnerEmployeeId()));
        dto.setMemberEmployeeIds(memberIds);
        dto.setMemberNames(memberIds.stream()
                .map(id -> formatOwnerName(employeeById.get(id), id))
                .collect(Collectors.toList()));

        dto.setTeamName(resolveTeamName(owner));
        dto.setHorizonLabel(objective.getHorizonLabel());
        dto.setDueDate(objective.getDueDate());
        dto.setProgressPercent(objective.getProgressPercent());
        dto.setWeighting(objective.getWeighting());
        dto.setRiskStatus(objective.getRiskStatus());
        dto.setRiskReason(objective.getRiskReason());
        dto.setDelayDays(objective.getDelayDays() == null ? 0 : objective.getDelayDays());
        dto.setLastUpdateAt(objective.getLastUpdateAt());
        dto.setDependencies(
                dependenciesByObjective.getOrDefault(objective.getObjectiveId(), List.of()));
        return dto;
    }

    private ManagerObjectiveMilestoneDTO toMilestoneDto(
            ObjectiveMilestone milestone, Map<Long, TeamObjective> objectiveById, Map<Integer, Employee> employeeById) {
        TeamObjective objective = objectiveById.get(milestone.getObjectiveId());
        Employee owner = objective == null ? null : employeeById.get(objective.getOwnerEmployeeId());
        ManagerObjectiveMilestoneDTO dto = new ManagerObjectiveMilestoneDTO();
        dto.setMilestoneId(milestone.getMilestoneId());
        dto.setObjectiveId(milestone.getObjectiveId());
        dto.setObjectiveCode(objective == null ? null : objective.getObjectiveCode());
        dto.setObjectiveTitle(objective == null ? "Objectif" : objective.getTitle());
        dto.setOwnerName(formatOwnerName(owner, objective == null ? null : objective.getOwnerEmployeeId()));
        dto.setLabel(milestone.getLabel());
        dto.setPlannedDate(milestone.getPlannedDate());
        dto.setActualDate(milestone.getActualDate());
        dto.setStatus(milestone.getStatus());
        dto.setVarianceDays(milestone.getVarianceDays());
        return dto;
    }

    private String resolveTeamName(Employee owner) {
        if (owner == null || owner.getDepartment() == null) return "Équipe";
        if (owner.getDepartment().getDepartmentName() == null || owner.getDepartment().getDepartmentName().isBlank()) {
            return "Équipe";
        }
        return owner.getDepartment().getDepartmentName();
    }

    private String formatOwnerName(Employee owner, Integer fallbackOwnerId) {
        if (owner == null) {
            return fallbackOwnerId == null ? "Collaborateur" : "Collaborateur #" + fallbackOwnerId;
        }
        String first = owner.getFirstName() == null ? "" : owner.getFirstName().trim();
        String last = owner.getLastName() == null ? "" : owner.getLastName().trim();
        String fullName = (first + " " + last).trim();
        return fullName.isBlank() ? ("Collaborateur #" + owner.getEmployeeId()) : fullName;
    }

    private String clean(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }

    private String normalizeScope(String rawScope) {
        String value = clean(rawScope, "TEAM").trim().toUpperCase().replace("É", "E");
        if ("INDIVIDUAL".equals(value) || "INDIVIDUEL".equals(value)) {
            return "INDIVIDUAL";
        }
        if ("TEAM".equals(value) || "EQUIPE".equals(value)) {
            return "TEAM";
        }
        return "TEAM";
    }

    private void applyComputedRisk(TeamObjective objective, LocalDate today) {
        RiskEvaluation evaluation = ObjectiveRiskCalculator.evaluate(
                objective.getDueDate(),
                objective.getProgressPercent(),
                objective.getCreatedAt(),
                today);
        objective.setRiskStatus(evaluation.status());
        objective.setRiskReason(evaluation.reason());
        objective.setDelayDays(evaluation.delayDays());
    }

    /** Recomputes risk on read so status stays aligned with elapsed time. */
    private List<TeamObjective> refreshRiskStatuses(List<TeamObjective> objectives) {
        if (objectives.isEmpty()) {
            return objectives;
        }
        LocalDate today = LocalDate.now();
        List<TeamObjective> toPersist = new ArrayList<>();
        for (TeamObjective objective : objectives) {
            String previousStatus = objective.getRiskStatus();
            String previousReason = objective.getRiskReason();
            int previousDelay = objective.getDelayDays() == null ? 0 : objective.getDelayDays();
            applyComputedRisk(objective, today);
            if (!Objects.equals(previousStatus, objective.getRiskStatus())
                    || !Objects.equals(previousReason, objective.getRiskReason())
                    || previousDelay != objective.getDelayDays()) {
                objective.setUpdatedAt(LocalDateTime.now());
                toPersist.add(objective);
            }
        }
        if (!toPersist.isEmpty()) {
            teamObjectiveRepository.saveAll(toPersist);
        }
        return objectives;
    }

    private String normalizeActionType(String rawActionType) {
        String value = clean(rawActionType, "REPLAN").toUpperCase();
        if (!Set.of("REPLAN", "ESCALATE", "CAPACITY_REINFORCEMENT").contains(value)) {
            return "REPLAN";
        }
        return value;
    }

    private BigDecimal clampPercent(BigDecimal value, BigDecimal fallback) {
        BigDecimal safe = value == null ? fallback : value;
        if (safe == null) return BigDecimal.ZERO;
        if (safe.compareTo(BigDecimal.ZERO) < 0) return BigDecimal.ZERO;
        if (safe.compareTo(new BigDecimal("100")) > 0) return new BigDecimal("100");
        return safe;
    }

    private BigDecimal clampPositive(BigDecimal value, BigDecimal fallback) {
        BigDecimal safe = value == null ? fallback : value;
        if (safe == null) return new BigDecimal("1.00");
        if (safe.compareTo(BigDecimal.ZERO) <= 0) return new BigDecimal("1.00");
        return safe;
    }

    private String generateCode(LocalDateTime now) {
        long value = now.getNano() + now.getSecond() * 1000L;
        return "OBJ-" + Math.abs(value % 1_000_000);
    }

    // ─── Delete objective ─────────────────────────────────────────────────────

    @SuppressWarnings("null")
    @org.springframework.transaction.annotation.Transactional
    public void deleteObjective(Integer managerId, Long objectiveId) {
        TeamObjective objective = teamObjectiveRepository
                .findByObjectiveIdAndManagerEmployeeId(objectiveId, managerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable."));
        // Child rows are removed by DB ON DELETE CASCADE; delete parent directly.
        @SuppressWarnings("null")
        TeamObjective toDelete = objective;
        teamObjectiveRepository.delete(toDelete);
    }

    // ─── Update objective ─────────────────────────────────────────────────────

    @org.springframework.transaction.annotation.Transactional
    public ManagerObjectiveDTO updateObjective(Integer managerId, Long objectiveId, UpdateTeamObjectiveDTO payload) {
        TeamObjective objective = teamObjectiveRepository
                .findByObjectiveIdAndManagerEmployeeId(objectiveId, managerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable."));

        if (payload.getTitle() != null && !payload.getTitle().isBlank()) {
            objective.setTitle(payload.getTitle().trim());
        }
        if (payload.getObjectiveScope() != null) {
            objective.setObjectiveScope(normalizeScope(payload.getObjectiveScope()));
        }
        if (payload.getOwnerEmployeeId() != null) {
            @SuppressWarnings("null")
            Employee newOwner = employeeRepository.findById(payload.getOwnerEmployeeId()).orElse(null);
            if (newOwner == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Propriétaire introuvable.");
            }
            objective.setOwnerEmployeeId(payload.getOwnerEmployeeId());
        }
        if (payload.getHorizonLabel() != null) {
            objective.setHorizonLabel(payload.getHorizonLabel().trim().isEmpty() ? "N/A" : payload.getHorizonLabel().trim());
        }
        if (payload.getDueDate() != null) {
            objective.setDueDate(payload.getDueDate());
        }
        if (payload.getProgressPercent() != null) {
            objective.setProgressPercent(clampPercent(payload.getProgressPercent(), objective.getProgressPercent()));
        }
        if (payload.getWeighting() != null) {
            objective.setWeighting(clampPositive(payload.getWeighting(), objective.getWeighting()));
        }

        LocalDateTime now = LocalDateTime.now();
        applyComputedRisk(objective, now.toLocalDate());
        objective.setLastUpdateAt(now);
        objective.setUpdatedAt(now);
        TeamObjective saved = teamObjectiveRepository.save(objective);

        // Replace dependencies if explicitly provided
        if (payload.getDependencies() != null) {
            objectiveDependencyRepository.deleteByObjectiveId(saved.getObjectiveId());
            saveDependencies(saved.getObjectiveId(), payload.getDependencies(), now);
        }

        @SuppressWarnings("null")
        Employee owner = employeeRepository.findById(saved.getOwnerEmployeeId()).orElse(null);
        Map<Long, List<String>> dependencies = mapDependencies(List.of(saved.getObjectiveId()));
        Map<Long, List<Integer>> membersByObjective = mapMembers(List.of(saved.getObjectiveId()));
        List<Integer> memberIds = membersByObjective.getOrDefault(saved.getObjectiveId(), List.of(saved.getOwnerEmployeeId()));
        @SuppressWarnings("null")
        Map<Integer, Employee> ownerMap = employeeRepository.findAllById(memberIds).stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));
        return toObjectiveDto(saved, owner, dependencies, membersByObjective, ownerMap);
    }

    // ─── Import: preview ──────────────────────────────────────────────────────

    public OkrImportPreviewResultDTO previewImport(Integer managerId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fichier vide ou absent.");
        }
        String orig = file.getOriginalFilename();
        String filename = orig != null ? orig.toLowerCase() : "";
        if (!filename.endsWith(".xlsx") && !filename.endsWith(".xls") && !filename.endsWith(".csv")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Format non supporté. Utilisez .xlsx ou .csv.");
        }

        // Fetch all employees of the manager once — avoids N+1
        List<Employee> teamMembers = employeeRepository.findAll().stream()
                .filter(e -> Objects.equals(e.getManagerId(), managerId)
                        || Objects.equals(e.getEmployeeId(), managerId))
                .collect(Collectors.toList());
        Map<Integer, Employee> employeeById = teamMembers.stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));

        List<OkrImportRowDTO> rows;
        try {
            if (filename.endsWith(".csv")) {
                rows = parseCsvFile(file, employeeById, managerId);
            } else {
                rows = parseExcelFile(file, employeeById, managerId);
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossible de lire le fichier : " + e.getMessage());
        }

        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le fichier ne contient aucune ligne de données.");
        }

        long validCount = rows.stream().filter(OkrImportRowDTO::isValid).count();
        OkrImportPreviewResultDTO result = new OkrImportPreviewResultDTO();
        result.setTotalRows(rows.size());
        result.setValidRows((int) validCount);
        result.setInvalidRows(rows.size() - (int) validCount);
        result.setRows(rows);
        return result;
    }

    private List<OkrImportRowDTO> parseExcelFile(MultipartFile file,
                                                   Map<Integer, Employee> employeeById,
                                                   Integer managerId) throws IOException {
        List<OkrImportRowDTO> result = new ArrayList<>();
        DataFormatter fmt = new DataFormatter();
        try (Workbook wb = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = wb.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) return result;

            Map<String, Integer> colIndex = buildColumnIndex(headerRow, fmt);
            int dataRows = sheet.getLastRowNum();
            for (int r = 1; r <= dataRows; r++) {
                Row row = sheet.getRow(r);
                if (isRowBlank(row)) continue;
                OkrImportRowDTO dto = buildRow(row, r + 1, colIndex, fmt, employeeById, managerId);
                result.add(dto);
            }
        }
        return result;
    }

    private List<OkrImportRowDTO> parseCsvFile(MultipartFile file,
                                                Map<Integer, Employee> employeeById,
                                                Integer managerId) throws IOException {
        List<OkrImportRowDTO> result = new ArrayList<>();
        String content = decodeCsvBytes(file.getBytes());
        String[] lines = content.split("\r?\n");
        if (lines.length < 2) return result;

        // Auto-detect delimiter: French Excel uses ';', standard uses ','
        char delimiter = detectCsvDelimiter(lines[0]);

        // Build column index from header line
        String[] headers = parseCsvLine(lines[0], delimiter);
        Map<String, Integer> colIndex = new HashMap<>();
        for (int i = 0; i < headers.length; i++) {
            colIndex.put(headers[i].trim().toLowerCase(), i);
        }

        for (int r = 1; r < lines.length; r++) {
            String line = lines[r].trim();
            if (line.isEmpty()) continue;
            String[] cells = parseCsvLine(line, delimiter);
            OkrImportRowDTO dto = buildRowFromArray(cells, r + 1, colIndex, employeeById, managerId);
            result.add(dto);
        }
        return result;
    }

    private Map<String, Integer> buildColumnIndex(Row headerRow, DataFormatter fmt) {
        Map<String, Integer> idx = new HashMap<>();
        for (int c = headerRow.getFirstCellNum(); c <= headerRow.getLastCellNum(); c++) {
            Cell cell = headerRow.getCell(c);
            if (cell != null) {
                String name = fmt.formatCellValue(cell).trim().toLowerCase();
                if (!name.isEmpty()) idx.put(name, c);
            }
        }
        return idx;
    }

    private OkrImportRowDTO buildRow(Row row, int displayIndex, Map<String, Integer> colIndex,
                                      DataFormatter fmt, Map<Integer, Employee> employeeById,
                                      Integer managerId) {
        OkrImportRowDTO dto = new OkrImportRowDTO();
        dto.setRowIndex(displayIndex);
        dto.setTitle(cell(row, colIndex, fmt, "titre"));
        dto.setObjectiveScope(cell(row, colIndex, fmt, "scope"));
        dto.setHorizonLabel(cell(row, colIndex, fmt, "horizon"));
        dto.setDependencies(cell(row, colIndex, fmt, "dependencies"));
        dto.setProgressPercent(parseBigDecimal(cell(row, colIndex, fmt, "progress")));
        dto.setWeighting(parseBigDecimal(cell(row, colIndex, fmt, "weighting")));
        dto.setDueDate(parseDate(cell(row, colIndex, fmt, "due_date")));
        dto.setCreatedAt(parseDate(cell(row, colIndex, fmt, "created_at")));

        // Owner resolution: numeric ID preferred
        String ownerRaw = cell(row, colIndex, fmt, "owner_employee_id");
        fillOwners(dto, ownerRaw, employeeById);

        validate(dto, employeeById);
        return dto;
    }

    private OkrImportRowDTO buildRowFromArray(String[] cells, int displayIndex,
                                               Map<String, Integer> colIndex,
                                               Map<Integer, Employee> employeeById,
                                               Integer managerId) {
        OkrImportRowDTO dto = new OkrImportRowDTO();
        dto.setRowIndex(displayIndex);
        dto.setTitle(csvCell(cells, colIndex, "titre"));
        dto.setObjectiveScope(csvCell(cells, colIndex, "scope"));
        dto.setHorizonLabel(csvCell(cells, colIndex, "horizon"));
        dto.setDependencies(csvCell(cells, colIndex, "dependencies"));
        dto.setProgressPercent(parseBigDecimal(csvCell(cells, colIndex, "progress")));
        dto.setWeighting(parseBigDecimal(csvCell(cells, colIndex, "weighting")));
        dto.setDueDate(parseDate(csvCell(cells, colIndex, "due_date")));
        dto.setCreatedAt(parseDate(csvCell(cells, colIndex, "created_at")));

        String ownerRaw = csvCell(cells, colIndex, "owner_employee_id");
        fillOwners(dto, ownerRaw, employeeById);

        validate(dto, employeeById);
        return dto;
    }

    private void fillOwners(OkrImportRowDTO dto, String ownerRaw, Map<Integer, Employee> employeeById) {
        if (ownerRaw == null || ownerRaw.isBlank()) return;
        String trimmed = ownerRaw.trim();
        List<Integer> parsedIds = parseEmployeeIds(trimmed);
        if (!parsedIds.isEmpty()) {
            dto.setMemberEmployeeIds(new ArrayList<>(parsedIds));
            List<String> names = new ArrayList<>();
            Integer firstResolved = null;
            for (Integer id : parsedIds) {
                Employee emp = employeeById.get(id);
                if (emp != null) {
                    if (firstResolved == null) {
                        firstResolved = id;
                    }
                    names.add(formatOwnerName(emp, id));
                }
            }
            if (firstResolved != null) {
                dto.setOwnerEmployeeId(firstResolved);
                dto.setOwnerName(String.join("; ", names));
            }
            return;
        }
        // Fallback: résolution par nom (un seul collaborateur)
        String lower = trimmed.toLowerCase();
        employeeById.values().stream()
                .filter(emp -> {
                    String full = formatOwnerName(emp, emp.getEmployeeId()).toLowerCase();
                    return full.contains(lower) || lower.contains(full.split(" ")[0]);
                })
                .findFirst()
                .ifPresent(emp -> {
                    dto.setOwnerEmployeeId(emp.getEmployeeId());
                    dto.setMemberEmployeeIds(List.of(emp.getEmployeeId()));
                    dto.setOwnerName(formatOwnerName(emp, emp.getEmployeeId()));
                });
    }

    private List<Integer> parseEmployeeIds(String raw) {
        String multiPattern = null;
        if (raw.contains("|")) {
            multiPattern = "\\|";
        } else if (raw.contains(";")) {
            multiPattern = ";";
        } else if (raw.contains(",")) {
            multiPattern = ",";
        }
        if (multiPattern != null) {
            return Arrays.stream(raw.split(multiPattern))
                    .map(String::trim)
                    .filter(part -> !part.isEmpty())
                    .map(part -> {
                        try {
                            return Integer.parseInt(part);
                        } catch (NumberFormatException e) {
                            return null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .distinct()
                    .collect(Collectors.toCollection(ArrayList::new));
        }
        try {
            return new ArrayList<>(List.of(Integer.parseInt(raw.trim())));
        } catch (NumberFormatException e) {
            return List.of();
        }
    }

    private void validate(OkrImportRowDTO dto, Map<Integer, Employee> employeeById) {
        List<String> errors = new ArrayList<>();
        if (dto.getTitle() == null || dto.getTitle().isBlank()) {
            errors.add("Titre obligatoire.");
        }
        List<Integer> members = dto.getMemberEmployeeIds() == null
                ? List.of()
                : dto.getMemberEmployeeIds();
        if (dto.getOwnerEmployeeId() == null) {
            errors.add("owner_employee_id introuvable ou non renseigné.");
        } else if ("INDIVIDUAL".equals(normalizeScope(dto.getObjectiveScope())) && members.size() > 1) {
            errors.add("scope INDIVIDUAL n'accepte qu'un seul owner_employee_id.");
        } else if (!members.isEmpty()) {
            for (Integer id : members) {
                if (!employeeById.containsKey(id)) {
                    errors.add("Employé introuvable ou hors équipe : id=" + id);
                }
            }
        }
        if (dto.getProgressPercent() != null) {
            if (dto.getProgressPercent().compareTo(BigDecimal.ZERO) < 0
                    || dto.getProgressPercent().compareTo(new BigDecimal("100")) > 0) {
                errors.add("La progression doit être entre 0 et 100.");
            }
        }
        if (dto.getCreatedAt() != null) {
            LocalDate today = LocalDate.now();
            if (dto.getCreatedAt().isAfter(today)) {
                errors.add("created_at ne peut pas être dans le futur.");
            }
            if (dto.getDueDate() != null && dto.getCreatedAt().isAfter(dto.getDueDate())) {
                errors.add("created_at ne peut pas être postérieur à due_date.");
            }
        }
        dto.setValid(errors.isEmpty());
        dto.setErrors(errors);
    }

    // ─── Import: commit ───────────────────────────────────────────────────────

    public OkrImportSummaryDTO commitImport(Integer managerId, OkrCommitImportRequestDTO request) {
        if (request == null || request.getRows() == null || request.getRows().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune ligne à importer.");
        }
        Map<Integer, Employee> employeeById = employeeRepository.findAll().stream()
                .filter(e -> Objects.equals(e.getManagerId(), managerId)
                        || Objects.equals(e.getEmployeeId(), managerId))
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));

        List<OkrImportRowDTO> rows = request.getRows();
        List<String> skippedTitles = new ArrayList<>();
        int inserted = 0;

        for (OkrImportRowDTO row : rows) {
            // Re-validate server-side regardless of client state
            validate(row, employeeById);
            if (!row.isValid()) {
                skippedTitles.add(row.getTitle() == null ? "Ligne " + row.getRowIndex() : row.getTitle());
                continue;
            }
            inserted += persistImportedRow(row, managerId, inserted);
        }

        OkrImportSummaryDTO summary = new OkrImportSummaryDTO();
        summary.setInsertedRows(inserted);
        summary.setSkippedRows(skippedTitles.size());
        summary.setSkippedTitles(skippedTitles);
        return summary;
    }

    /**
     * Insère une ligne d'import : 1 ligne CSV = 1 objectif en BDD.
     * Équipe multi-membres : un seul team_objectives + N lignes team_objective_members
     * (affichage portefeuille = une ligne, noms concaténés via memberNames).
     */
    private int persistImportedRow(OkrImportRowDTO row, Integer managerId, int insertedSoFar) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime createdAt = row.getCreatedAt() != null
                ? row.getCreatedAt().atStartOfDay()
                : now;
        String scope = normalizeScope(row.getObjectiveScope());
        List<Integer> memberIds = resolveImportOwnerIds(row, scope);

        List<String> deps = row.getDependencies() == null || row.getDependencies().isBlank()
                ? List.of()
                : Arrays.stream(row.getDependencies().split(";"))
                        .map(String::trim)
                        .filter(part -> !part.isEmpty())
                        .toList();

        TeamObjective obj = new TeamObjective();
        obj.setObjectiveCode(generateCode(now.plusNanos(insertedSoFar)));
        obj.setTitle(row.getTitle().trim());
        obj.setObjectiveScope(scope);
        obj.setOwnerEmployeeId(memberIds.get(0));
        obj.setManagerEmployeeId(managerId);
        obj.setHorizonLabel(clean(row.getHorizonLabel(), "N/A"));
        obj.setDueDate(row.getDueDate() != null ? row.getDueDate() : LocalDate.now().plusDays(30));
        obj.setProgressPercent(clampPercent(row.getProgressPercent(), BigDecimal.ZERO));
        obj.setWeighting(clampPositive(row.getWeighting(), new BigDecimal("1.00")));
        obj.setCreatedAt(createdAt);
        obj.setLastUpdateAt(createdAt);
        obj.setUpdatedAt(now);
        applyComputedRisk(obj, now.toLocalDate());
        TeamObjective saved = teamObjectiveRepository.save(obj);

        if (!deps.isEmpty()) {
            saveDependencies(saved.getObjectiveId(), deps, now);
        }

        for (Integer memberId : memberIds) {
            TeamObjectiveMember link = new TeamObjectiveMember();
            link.setObjectiveId(saved.getObjectiveId());
            link.setEmployeeId(memberId);
            teamObjectiveMemberRepository.save(link);
        }

        return 1;
    }

    private List<Integer> resolveImportOwnerIds(OkrImportRowDTO row, String scope) {
        if ("TEAM".equals(scope)
                && row.getMemberEmployeeIds() != null
                && !row.getMemberEmployeeIds().isEmpty()) {
            return new ArrayList<>(row.getMemberEmployeeIds());
        }
        return List.of(row.getOwnerEmployeeId());
    }

    // ─── Parsing helpers ──────────────────────────────────────────────────────

    private String cell(Row row, Map<String, Integer> idx, DataFormatter fmt, String colName) {
        Integer c = idx.get(colName);
        if (c == null) return null;
        Cell cell = row.getCell(c);
        if (cell == null) return null;
        String val = fmt.formatCellValue(cell).trim();
        return val.isEmpty() ? null : val;
    }

    private String csvCell(String[] cells, Map<String, Integer> idx, String colName) {
        Integer c = idx.get(colName);
        if (c == null || c >= cells.length) return null;
        String val = cells[c].trim();
        return val.isEmpty() ? null : val;
    }

    private boolean isRowBlank(Row row) {
        if (row == null) return true;
        for (int c = row.getFirstCellNum(); c <= row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK) {
                String val = cell.toString().trim();
                if (!val.isEmpty()) return false;
            }
        }
        return true;
    }

    private BigDecimal parseBigDecimal(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try { return new BigDecimal(raw.replace(",", ".")); } catch (NumberFormatException e) { return null; }
    }

    private LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        for (DateTimeFormatter f : List.of(
                DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("d/M/yyyy"))) {
            try { return LocalDate.parse(raw.trim(), f); } catch (DateTimeParseException ignored) {}
        }
        return null;
    }

    /**
     * Decode CSV bytes with automatic encoding detection.
     * Priority: UTF-8 with BOM → UTF-8 (if valid) → Windows-1252 (French Excel default).
     */
    private String decodeCsvBytes(byte[] bytes) {
        // Strip UTF-8 BOM if present (EF BB BF)
        byte[] data = bytes;
        if (bytes.length >= 3 && bytes[0] == (byte) 0xEF && bytes[1] == (byte) 0xBB && bytes[2] == (byte) 0xBF) {
            data = java.util.Arrays.copyOfRange(bytes, 3, bytes.length);
        }
        // Try strict UTF-8 — if no replacement chars, file is genuine UTF-8
        java.nio.charset.CharsetDecoder utf8 = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(java.nio.charset.CodingErrorAction.REPLACE)
                .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPLACE);
        String attempt;
        try {
            attempt = utf8.decode(java.nio.ByteBuffer.wrap(data)).toString();
        } catch (Exception e) {
            attempt = "";
        }
        if (!attempt.contains("\uFFFD")) {
            return attempt; // Valid UTF-8
        }
        // Fall back to Windows-1252 (Western European — French Excel default)
        try {
            return new String(data, "windows-1252");
        } catch (java.io.UnsupportedEncodingException e) {
            return new String(data, java.nio.charset.StandardCharsets.ISO_8859_1);
        }
    }

    private char detectCsvDelimiter(String headerLine) {
        int commas = 0, semis = 0;
        boolean inQuotes = false;
        for (char ch : headerLine.toCharArray()) {
            if (ch == '"') inQuotes = !inQuotes;
            else if (!inQuotes) {
                if (ch == ',') commas++;
                else if (ch == ';') semis++;
            }
        }
        return semis > commas ? ';' : ',';
    }

    private String[] parseCsvLine(String line, char delimiter) {
        List<String> result = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (char ch : line.toCharArray()) {
            if (ch == '"') { inQuotes = !inQuotes; }
            else if (ch == delimiter && !inQuotes) { result.add(current.toString().trim()); current.setLength(0); }
            else { current.append(ch); }
        }
        result.add(current.toString().trim());
        return result.toArray(new String[0]);
    }
}
