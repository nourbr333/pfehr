package com.hranalytics.hrbackend.entity;

import jakarta.persistence.*;
import lombok.Data;
import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Entity
@Table(
    name = "kpi_thresholds",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_kpi_thresholds_user_kpi",
        columnNames = {"user_id", "kpi_key"}
    )
)
public class KpiThreshold {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Internal KPI identifier: attendance | absenteisme | retard */
    @Column(name = "kpi_key", nullable = false, length = 50)
    private String kpiKey;

    @Column(name = "kpi_label", length = 120)
    private String kpiLabel;

    /** Human-readable period, e.g. "Juin 2026" */
    @Column(name = "period_label", length = 50)
    private String periodLabel;

    /** Seuil d'alerte (%) */
    @Column(name = "threshold_value", precision = 8, scale = 2)
    private BigDecimal thresholdValue;

    /** Objectif cible (%) */
    @Column(name = "target_value", precision = 8, scale = 2)
    private BigDecimal targetValue;

    @Column(name = "phrase_officielle", columnDefinition = "TEXT")
    private String phraseOfficielle;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
