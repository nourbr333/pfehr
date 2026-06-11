package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.EmployeeEvaluationDTO;
import com.hranalytics.hrbackend.service.EmployeeEvaluationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/employees")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EmployeeEvaluationsController {

    private final EmployeeEvaluationService evaluationService;

    public EmployeeEvaluationsController(EmployeeEvaluationService evaluationService) {
        this.evaluationService = evaluationService;
    }

    @GetMapping("/{employeeId}/evaluations")
    public List<EmployeeEvaluationDTO> listByEmployee(@PathVariable @Positive Integer employeeId) {
        return evaluationService.findByEmployeeId(employeeId);
    }

    @PostMapping("/{employeeId}/evaluations")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RESPONSABLE_RH', 'ROLE_MANAGER')")
    public EmployeeEvaluationDTO createForEmployee(
            @PathVariable @Positive Integer employeeId, @Valid @RequestBody EmployeeEvaluationDTO payload) {
        return evaluationService.createForEmployee(employeeId, payload);
    }

    @PutMapping("/{employeeId}/evaluations/{evaluationId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RESPONSABLE_RH', 'ROLE_MANAGER')")
    public EmployeeEvaluationDTO updateForEmployee(
            @PathVariable @Positive Integer employeeId,
            @PathVariable @Positive Integer evaluationId,
            @Valid @RequestBody EmployeeEvaluationDTO payload) {
        return evaluationService.updateForEmployee(employeeId, evaluationId, payload);
    }

    @DeleteMapping("/{employeeId}/evaluations/{evaluationId}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_RESPONSABLE_RH', 'ROLE_MANAGER')")
    public void deleteForEmployee(
            @PathVariable @Positive Integer employeeId, @PathVariable @Positive Integer evaluationId) {
        evaluationService.deleteForEmployee(employeeId, evaluationId);
    }
}
