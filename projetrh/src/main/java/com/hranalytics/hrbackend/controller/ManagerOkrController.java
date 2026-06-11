package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.CreateObjectiveActionPlanDTO;
import com.hranalytics.hrbackend.dto.CreateTeamObjectiveDTO;
import com.hranalytics.hrbackend.dto.ManagerObjectiveDTO;
import com.hranalytics.hrbackend.dto.ManagerOkrDashboardDTO;
import com.hranalytics.hrbackend.dto.ObjectiveProgressUpdateDTO;
import com.hranalytics.hrbackend.dto.OkrCommitImportRequestDTO;
import com.hranalytics.hrbackend.dto.OkrImportPreviewResultDTO;
import com.hranalytics.hrbackend.dto.OkrImportSummaryDTO;
import com.hranalytics.hrbackend.dto.UpdateTeamObjectiveDTO;
import com.hranalytics.hrbackend.security.AuthenticatedUser;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.ManagerOkrService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.server.ResponseStatusException;

@RestController
@Validated
@RequestMapping("/api/managers")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class ManagerOkrController {

    private final ManagerOkrService managerOkrService;

    public ManagerOkrController(ManagerOkrService managerOkrService) {
        this.managerOkrService = managerOkrService;
    }

    @GetMapping("/{managerId}/okr/dashboard")
    public ManagerOkrDashboardDTO getDashboard(@PathVariable @Positive Integer managerId) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.getDashboard(managerId);
    }

    @GetMapping("/okr/all-objectives")
    public ManagerOkrDashboardDTO getAllObjectives() {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        if (!SecurityUtils.isAdminOrRh(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès réservé au portail RH.");
        }
        return managerOkrService.getAllObjectives();
    }

    @PostMapping("/{managerId}/okr/objectives")
    public ManagerObjectiveDTO createObjective(
            @PathVariable @Positive Integer managerId, @Valid @RequestBody CreateTeamObjectiveDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.createObjective(managerId, payload);
    }

    @PostMapping("/{managerId}/okr/objectives/{objectiveId}/progress")
    public ManagerObjectiveDTO updateProgress(
            @PathVariable @Positive Integer managerId,
            @PathVariable @Positive Long objectiveId,
            @Valid @RequestBody ObjectiveProgressUpdateDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.updateObjectiveProgress(managerId, objectiveId, payload);
    }

    @PostMapping("/{managerId}/okr/objectives/{objectiveId}/action-plans")
    public void createActionPlan(
            @PathVariable @Positive Integer managerId,
            @PathVariable @Positive Long objectiveId,
            @Valid @RequestBody CreateObjectiveActionPlanDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        managerOkrService.createActionPlan(managerId, objectiveId, payload);
    }

    @PostMapping("/{managerId}/okr/objectives/preview-import")
    public OkrImportPreviewResultDTO previewImport(
            @PathVariable @Positive Integer managerId,
            @RequestParam("file") MultipartFile file) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.previewImport(managerId, file);
    }

    @PostMapping("/{managerId}/okr/objectives/commit-import")
    public OkrImportSummaryDTO commitImport(
            @PathVariable @Positive Integer managerId,
            @RequestBody OkrCommitImportRequestDTO request) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.commitImport(managerId, request);
    }

    @PutMapping("/{managerId}/okr/objectives/{objectiveId}")
    public ManagerObjectiveDTO updateObjective(
            @PathVariable @Positive Integer managerId,
            @PathVariable @Positive Long objectiveId,
            @Valid @RequestBody UpdateTeamObjectiveDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerOkrService.updateObjective(managerId, objectiveId, payload);
    }

    @DeleteMapping("/{managerId}/okr/objectives/{objectiveId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteObjective(
            @PathVariable @Positive Integer managerId,
            @PathVariable @Positive Long objectiveId) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        managerOkrService.deleteObjective(managerId, objectiveId);
    }
}
