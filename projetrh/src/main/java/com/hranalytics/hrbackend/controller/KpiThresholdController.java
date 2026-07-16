package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.*;
import com.hranalytics.hrbackend.security.AuthenticatedUser;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.KpiThresholdService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/kpi-thresholds")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class KpiThresholdController {

    private final KpiThresholdService service;

    public KpiThresholdController(KpiThresholdService service) {
        this.service = service;
    }

    @GetMapping
    public List<KpiThresholdDTO> getMine() {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        if (user.getUserId() == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Compte utilisateur introuvable.");
        }
        return service.getByUser(user.getUserId());
    }

    @PostMapping
    public ResponseEntity<KpiThresholdDTO> save(@Valid @RequestBody KpiThresholdSaveRequest request) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        if (user.getUserId() == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Compte utilisateur introuvable.");
        }
        request.setUserId(user.getUserId());
        KpiThresholdDTO saved = service.save(request);
        return ResponseEntity.status(HttpStatus.OK).body(saved);
    }

    @PostMapping("/check-batch")
    public List<KpiThresholdCheckResult> checkBatch(@RequestBody KpiThresholdCheckBatchRequest request) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        if (user.getUserId() == null) {
            return List.of();
        }
        request.setUserId(user.getUserId());
        return service.checkBatch(request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        service.delete(id, user.getUserId(), SecurityUtils.isAdmin(user));
        return ResponseEntity.noContent().build();
    }
}

