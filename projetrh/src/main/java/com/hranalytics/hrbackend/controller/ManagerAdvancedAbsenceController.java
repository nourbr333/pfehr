package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.ContinuityPlanResultDTO;
import com.hranalytics.hrbackend.dto.CreateContinuityPlanDTO;
import com.hranalytics.hrbackend.dto.DateAlternativeRequestDTO;
import com.hranalytics.hrbackend.dto.DateAlternativeResponseDTO;
import com.hranalytics.hrbackend.dto.ManagerAdvancedAbsenceDashboardDTO;
import com.hranalytics.hrbackend.dto.ManagerCrossAnalysisDTO;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.ManagerAdvancedAbsenceService;
import com.hranalytics.hrbackend.service.ManagerCrossAnalysisService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/managers")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class ManagerAdvancedAbsenceController {
    private final ManagerAdvancedAbsenceService managerAdvancedAbsenceService;
    private final ManagerCrossAnalysisService managerCrossAnalysisService;

    public ManagerAdvancedAbsenceController(
            ManagerAdvancedAbsenceService managerAdvancedAbsenceService,
            ManagerCrossAnalysisService managerCrossAnalysisService) {
        this.managerAdvancedAbsenceService = managerAdvancedAbsenceService;
        this.managerCrossAnalysisService = managerCrossAnalysisService;
    }

    @GetMapping("/{managerId}/advanced-absences/dashboard")
    public ManagerAdvancedAbsenceDashboardDTO getDashboard(
            @PathVariable @Positive Integer managerId,
            @RequestParam(required = false) String viewMode,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate referenceDate,
            @RequestParam(required = false) @PositiveOrZero Integer threshold) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerAdvancedAbsenceService.getDashboard(managerId, viewMode, referenceDate, threshold);
    }

    @PostMapping("/{managerId}/advanced-absences/suggest-alternatives")
    public DateAlternativeResponseDTO suggestAlternatives(
            @PathVariable @Positive Integer managerId, @Valid @RequestBody DateAlternativeRequestDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerAdvancedAbsenceService.suggestAlternatives(managerId, payload);
    }

    @PostMapping("/{managerId}/advanced-absences/continuity-plans")
    public ContinuityPlanResultDTO createContinuityPlan(
            @PathVariable @Positive Integer managerId, @Valid @RequestBody CreateContinuityPlanDTO payload) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerAdvancedAbsenceService.createContinuityPlan(managerId, payload);
    }

    @GetMapping("/{managerId}/advanced-absences/continuity-plans")
    public List<ContinuityPlanResultDTO> getContinuityPlans(@PathVariable @Positive Integer managerId) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerAdvancedAbsenceService.getContinuityPlans(managerId);
    }

    @GetMapping("/{managerId}/cross-analysis")
    public ManagerCrossAnalysisDTO getCrossAnalysis(@PathVariable @Positive Integer managerId) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return managerCrossAnalysisService.getCrossAnalysis(managerId);
    }
}
