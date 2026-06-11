package com.hranalytics.hrbackend.dto;

import lombok.Data;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class KpiThresholdDTO {
    private Long id;
    private Long userId;
    private String kpiKey;
    private String kpiLabel;
    private String periodLabel;
    private BigDecimal thresholdValue;
    private BigDecimal targetValue;
    private String phraseOfficielle;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime updatedAt;
}
