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
        List<TeamObjective> objectives = teamObjectiveRepository.findAll();
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
        List<TeamObjective> objectives = teamObjectiveRepository.findByManagerEmployeeIdOrderByDueDateAsc(managerId);
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

        // Determine the list of owner IDs to create objectives for
        List<Integer> ownerIds;
        boolean isTeamMulti = "TEAM".equalsIgnoreCase(payload.getObjectiveScope())
                && payload.getMemberEmployeeIds() != null
                && !payload.getMemberEmployeeIds().isEmpty();

        if (isTeamMulti) {
            ownerIds = new ArrayList<>(payload.getMemberEmployeeIds());
        } else {
            ownerIds = List.of(payload.getOwnerEmployeeId());
        }

        // Validate all owners belong to this manager's team
        for (Integer ownerId : ownerIds) {
            @SuppressWarnings("null")
            Employee owner = employeeRepository.findById(ownerId).orElse(null);
            if (owner == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Employé introuvable : id=" + ownerId);
            }
            if (!Objects.equals(owner.getManagerId(), managerId) && !Objects.equals(owner.getEmployeeId(), managerId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "L'employé " + ownerId + " n'appartient pas à l'équipe du manager.");
            }
        }

        LocalDateTime now = LocalDateTime.now();
        TeamObjective firstSaved = null;
        Employee firstOwner = null;
        List<Long> createdIds = new ArrayList<>();

        for (int i = 0; i < ownerIds.size(); i++) {
            Integer ownerId = ownerIds.get(i);
            @SuppressWarnings("null")
            Employee owner = employeeRepository.findById(ownerId).orElseThrow();
            TeamObjective objective = new TeamObjective();
            // Use a unique suffix per iteration to avoid UNIQUE constraint violations on objective_code
            objective.setObjectiveCode(clean(payload.getObjectiveCode(), generateCode(now.plusNanos(i))));
            objective.setTitle(payload.getTitle().trim());
            objective.setObjectiveScope(normalizeScope(payload.getObjectiveScope()));
            objective.setOwnerEmployeeId(ownerId);
            objective.setManagerEmployeeId(managerId);
            objective.setHorizonLabel(clean(payload.getHorizonLabel(), "N/A"));
            objective.setDueDate(payload.getDueDate() != null ? payload.getDueDate() : LocalDate.now().plusDays(30));
            objective.setProgressPercent(clampPercent(payload.getProgressPercent(), BigDecimal.ZERO));
            objective.setWeighting(clampPositive(payload.getWeighting(), new BigDecimal("1.00")));
            objective.setRiskStatus(normalizeRisk(payload.getRiskStatus()));
            objective.setRiskReason(clean(payload.getRiskReason(), null));
            objective.setDelayDays(payload.getDelayDays() == null || payload.getDelayDays() < 0 ? 0 : payload.getDelayDays());
            objective.setLastUpdateAt(now);
            objective.setCreatedAt(now);
            objective.setUpdatedAt(now);
            TeamObjective saved = teamObjectiveRepository.save(objective);
            saveDependencies(saved.getObjectiveId(), payload.getDependencies(), now);
            createdIds.add(saved.getObjectiveId());
            if (firstSaved == null) {
                firstSaved = saved;
                firstOwner = owner;
            }
        }

        // For TEAM scope with multiple members, save all member IDs to the join table
        // so that the portfolio can show all owners of this logical group.
        if (isTeamMulti) {
            // All created objectives belong to the same team assignment — link each
            // objective to all selected member IDs so the frontend can aggregate.
            for (Long objId : createdIds) {
                for (Integer memberId : ownerIds) {
                    TeamObjectiveMember link = new TeamObjectiveMember();
                    link.setObjectiveId(objId);
                    link.setEmployeeId(memberId);
                    teamObjectiveMemberRepository.save(link);
                }
            }
        } else {
            // Individual objective — single member row
            @SuppressWarnings("null") final TeamObjective firstSavedRef = firstSaved;
            TeamObjectiveMember link = new TeamObjectiveMember();
            link.setObjectiveId(firstSavedRef.getObjectiveId());
            link.setEmployeeId(firstSavedRef.getOwnerEmployeeId());
            teamObjectiveMemberRepository.save(link);
        }

        @SuppressWarnings("null") final TeamObjective firstSavedFinal = firstSaved;
        Map<Long, List<String>> dependencies = mapDependencies(List.of(firstSavedFinal.getObjectiveId()));
        Map<Long, List<Integer>> membersByObjective = mapMembers(createdIds);
        Map<Integer, Employee> ownerMap = employeeRepository.findAllById(ownerIds).stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, e -> e));
        return toObjectiveDto(firstSavedFinal, firstOwner, dependencies, membersByObjective, ownerMap);
    }

    public ManagerObjectiveDTO updateObjectiveProgress(
            Integer managerId, Long objectiveId, ObjectiveProgressUpdateDTO payload) {
        TeamObjective objective =
                teamObjectiveRepository
                        .findByObjectiveIdAndManagerEmployeeId(objectiveId, managerId)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable."));

        BigDecimal progress = clampPercent(payload == null ? null : payload.getProgressPercent(), objective.getProgressPercent());
        String riskStatus = payload == null ? objective.getRiskStatus() : normalizeRisk(payload.getRiskStatus(), objective.getRiskStatus());
        String riskReason = payload == null ? objective.getRiskReason() : clean(payload.getRiskReason(), objective.getRiskReason());
        Integer authorId =
                payload == null || payload.getAuthorEmployeeId() == null ? managerId : payload.getAuthorEmployeeId();

        LocalDateTime now = LocalDateTime.now();
        objective.setProgressPercent(progress);
        objective.setRiskStatus(riskStatus);
        objective.setRiskReason(riskReason);
        objective.setLastUpdateAt(now);
        objective.setUpdatedAt(now);
        TeamObjective updated = teamObjectiveRepository.save(objective);

        ObjectiveProgressUpdate progressUpdate = new ObjectiveProgressUpdate();
        progressUpdate.setObjectiveId(objectiveId);
        progressUpdate.setAuthorEmployeeId(authorId);
        progressUpdate.setProgressPercent(progress);
        progressUpdate.setCommentText(payload == null ? null : clean(payload.getCommentText(), null));
        progressUpdate.setRiskStatus(riskStatus);
        progressUpdate.setRiskReason(riskReason);
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
        String value = clean(rawScope, "TEAM").toUpperCase();
        if (!Set.of("TEAM", "INDIVIDUAL").contains(value)) {
            return "TEAM";
        }
        return value;
    }

    private String normalizeRisk(String rawRisk) {
        return normalizeRisk(rawRisk, "AT_RISK");
    }

    private String normalizeRisk(String rawRisk, String fallback) {
        String value = clean(rawRisk, fallback).toUpperCase();
        if (!Set.of("ON_TRACK", "AT_RISK", "OFF_TRACK").contains(value)) {
            return fallback;
        }
        return value;
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
        if (payload.getRiskStatus() != null) {
            objective.setRiskStatus(normalizeRisk(payload.getRiskStatus(), objective.getRiskStatus()));
        }
        if (payload.getRiskReason() != null) {
            objective.setRiskReason(payload.getRiskReason().isBlank() ? null : payload.getRiskReason().trim());
        }
        if (payload.getDelayDays() != null) {
            objective.setDelayDays(Math.max(0, payload.getDelayDays()));
        }

        LocalDateTime now = LocalDateTime.now();
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
        dto.setRiskStatus(cell(row, colIndex, fmt, "risk_status"));
        dto.setDueDate(parseDate(cell(row, colIndex, fmt, "due_date")));

        // Owner resolution: numeric ID preferred
        String ownerRaw = cell(row, colIndex, fmt, "owner_employee_id");
        fillOwner(dto, ownerRaw, employeeById, managerId);

        validate(dto, managerId);
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
        dto.setRiskStatus(csvCell(cells, colIndex, "risk_status"));
        dto.setDueDate(parseDate(csvCell(cells, colIndex, "due_date")));

        String ownerRaw = csvCell(cells, colIndex, "owner_employee_id");
        fillOwner(dto, ownerRaw, employeeById, managerId);

        validate(dto, managerId);
        return dto;
    }

    private void fillOwner(OkrImportRowDTO dto, String ownerRaw,
                            Map<Integer, Employee> employeeById, Integer managerId) {
        if (ownerRaw == null || ownerRaw.isBlank()) return;
        String trimmed = ownerRaw.trim();
        try {
            int id = Integer.parseInt(trimmed);
            dto.setOwnerEmployeeId(id);
            Employee emp = employeeById.get(id);
            if (emp != null) dto.setOwnerName(formatOwnerName(emp, id));
        } catch (NumberFormatException e) {
            // Try name-based resolution: "Prénom Nom"
            String lower = trimmed.toLowerCase();
            employeeById.values().stream()
                    .filter(emp -> {
                        String full = (formatOwnerName(emp, emp.getEmployeeId())).toLowerCase();
                        return full.contains(lower) || lower.contains(full.split(" ")[0]);
                    })
                    .findFirst()
                    .ifPresent(emp -> {
                        dto.setOwnerEmployeeId(emp.getEmployeeId());
                        dto.setOwnerName(formatOwnerName(emp, emp.getEmployeeId()));
                    });
        }
    }

    private void validate(OkrImportRowDTO dto, Integer managerId) {
        List<String> errors = new ArrayList<>();
        if (dto.getTitle() == null || dto.getTitle().isBlank()) {
            errors.add("Titre obligatoire.");
        }
        if (dto.getOwnerEmployeeId() == null) {
            errors.add("owner_employee_id introuvable ou non renseigné.");
        }
        if (dto.getProgressPercent() != null) {
            if (dto.getProgressPercent().compareTo(BigDecimal.ZERO) < 0
                    || dto.getProgressPercent().compareTo(new BigDecimal("100")) > 0) {
                errors.add("La progression doit être entre 0 et 100.");
            }
        }
        if (dto.getRiskStatus() != null && !dto.getRiskStatus().isBlank()) {
            String rs = dto.getRiskStatus().toUpperCase();
            if (!Set.of("ON_TRACK", "AT_RISK", "OFF_TRACK").contains(rs)) {
                errors.add("risk_status invalide (ON_TRACK / AT_RISK / OFF_TRACK).");
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
        List<OkrImportRowDTO> rows = request.getRows();
        List<String> skippedTitles = new ArrayList<>();
        int inserted = 0;

        for (OkrImportRowDTO row : rows) {
            // Re-validate server-side regardless of client state
            validate(row, managerId);
            if (!row.isValid()) {
                skippedTitles.add(row.getTitle() == null ? "Ligne " + row.getRowIndex() : row.getTitle());
                continue;
            }
            LocalDateTime now = LocalDateTime.now();
            TeamObjective obj = new TeamObjective();
            obj.setObjectiveCode(generateCode(now.plusNanos(inserted)));
            obj.setTitle(row.getTitle().trim());
            obj.setObjectiveScope(normalizeScope(row.getObjectiveScope()));
            obj.setOwnerEmployeeId(row.getOwnerEmployeeId());
            obj.setManagerEmployeeId(managerId);
            obj.setHorizonLabel(clean(row.getHorizonLabel(), "N/A"));
            obj.setDueDate(row.getDueDate() != null ? row.getDueDate() : LocalDate.now().plusDays(30));
            obj.setProgressPercent(clampPercent(row.getProgressPercent(), BigDecimal.ZERO));
            obj.setWeighting(clampPositive(row.getWeighting(), new BigDecimal("1.00")));
            obj.setRiskStatus(normalizeRisk(row.getRiskStatus(), "ON_TRACK"));
            obj.setRiskReason(null);
            obj.setDelayDays(0);
            obj.setLastUpdateAt(now);
            obj.setCreatedAt(now);
            obj.setUpdatedAt(now);
            TeamObjective saved = teamObjectiveRepository.save(obj);

            if (row.getDependencies() != null && !row.getDependencies().isBlank()) {
                List<String> deps = Arrays.stream(row.getDependencies().split(";"))
                        .map(String::trim).filter(s -> !s.isEmpty()).toList();
                saveDependencies(saved.getObjectiveId(), deps, now);
            }
            inserted++;
        }

        OkrImportSummaryDTO summary = new OkrImportSummaryDTO();
        summary.setInsertedRows(inserted);
        summary.setSkippedRows(skippedTitles.size());
        summary.setSkippedTitles(skippedTitles);
        return summary;
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
