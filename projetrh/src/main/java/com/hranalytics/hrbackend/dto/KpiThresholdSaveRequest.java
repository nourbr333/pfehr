package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

import java.math.BigDecimal;

/** Payload to save (create-or-update) a KPI threshold/target configuration. */
@Data
public class KpiThresholdSaveRequest {
    private Long userId;
    private String kpiKey;
    private String kpiLabel;
    private String periodLabel;

    @DecimalMin(value = "0.0", message = "Le seuil d'alerte doit être compris entre 0 et 100.")
    @DecimalMax(value = "100.0", message = "Le seuil d'alerte doit être compris entre 0 et 100.")
    private BigDecimal thresholdValue;

    @DecimalMin(value = "0.0", message = "L'objectif cible doit être compris entre 0 et 100.")
    @DecimalMax(value = "100.0", message = "L'objectif cible doit être compris entre 0 et 100.")
    private BigDecimal targetValue;

    private String phraseOfficielle;
}
