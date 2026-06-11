package com.hranalytics.hrbackend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class KpiThresholdCheckBatchRequest {

    private Long userId;
    private List<KpiValueEntry> entries;

    @Data
    public static class KpiValueEntry {
        private String kpiKey;
        private BigDecimal currentValue;
    }
}
