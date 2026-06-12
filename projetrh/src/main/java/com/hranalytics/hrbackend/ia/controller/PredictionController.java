package com.hranalytics.hrbackend.ia.controller;

import com.hranalytics.hrbackend.ia.dto.PredictionResponseDTO;
import com.hranalytics.hrbackend.ia.service.PredictionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints de prédiction IA. Accès : ADMIN, RESPONSABLE_RH, MANAGER. */
@RestController
@RequestMapping("/api/predictions")
public class PredictionController {

    private final PredictionService predictionService;

    public PredictionController(PredictionService predictionService) {
        this.predictionService = predictionService;
    }

    /** P1 — Risque d'absentéisme d'un employé sur les 30 prochains jours. */
    @GetMapping("/absenteisme/{employeeId}")
    public PredictionResponseDTO absenteisme(@PathVariable Integer employeeId) {
        return predictionService.predictAbsenteisme(employeeId);
    }

    /** P2 — Risque de burnout d'un employé. */
    @GetMapping("/burnout/{employeeId}")
    public PredictionResponseDTO burnout(@PathVariable Integer employeeId) {
        return predictionService.predictBurnout(employeeId);
    }

    /** P3 — Risque de non-atteinte d'un objectif OKR avant sa deadline. */
    @GetMapping("/okr/{objectiveId}")
    public PredictionResponseDTO okr(@PathVariable Long objectiveId) {
        return predictionService.predictOkr(objectiveId);
    }
}
