package com.hranalytics.hrbackend.dto;

import lombok.Data;

import java.math.BigDecimal;

/** Payload to save (create-or-update) a KPI threshold/target configuration. */
@Data
public class KpiThresholdSaveRequest {
    private Long userId;
    private String kpiKey;
    private String kpiLabel;
    private String periodLabel;
    private BigDecimal thresholdValue;
    private BigDecimal targetValue;
    private String phraseOfficielle;
}
