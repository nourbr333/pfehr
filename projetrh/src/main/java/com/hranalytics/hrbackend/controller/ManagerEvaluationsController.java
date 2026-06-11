package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.EvaluationImportRowDTO;
import com.hranalytics.hrbackend.dto.EvaluationImportSummaryDTO;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.EmployeeEvaluationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Validated
@RequestMapping("/api/managers")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class ManagerEvaluationsController {

    private final EmployeeEvaluationService evaluationService;

    public ManagerEvaluationsController(EmployeeEvaluationService evaluationService) {
        this.evaluationService = evaluationService;
    }

    @PostMapping("/{managerId}/import-evaluations-rows")
    public EvaluationImportSummaryDTO importRows(
            @PathVariable @Positive Integer managerId,
            @Valid @RequestBody List<EvaluationImportRowDTO> rows) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return evaluationService.importRowsForManager(managerId, rows);
    }

    @PostMapping("/{managerId}/import-evaluations-excel")
    public EvaluationImportSummaryDTO importExcel(            @PathVariable @Positive Integer managerId,
            @RequestParam("file") MultipartFile file) {
        SecurityUtils.requireManagerAccess(SecurityUtils.requireAuthenticated(), managerId);
        return evaluationService.importExcelForManager(managerId, file);
    }
}
