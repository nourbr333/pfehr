package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;

/**
 * Payload for PUT /api/managers/{managerId}/okr/objectives/{objectiveId}.
 * All fields are optional — only non-null values are applied.
 */
@Data
public class UpdateTeamObjectiveDTO {

    @Size(max = 255)
    private String title;

    @Pattern(regexp = "(?i)(TEAM|INDIVIDUAL)", message = "objectiveScope must be TEAM or INDIVIDUAL")
    private String objectiveScope;

    @Positive
    private Integer ownerEmployeeId;

    @Size(max = 100)
    private String horizonLabel;

    private LocalDate dueDate;

    @DecimalMin(value = "0.0")
    @DecimalMax(value = "100.0")
    private BigDecimal progressPercent;

    @DecimalMin(value = "0.0", inclusive = false)
    private BigDecimal weighting;

    @Pattern(
            regexp = "(?i)(ON_TRACK|AT_RISK|OFF_TRACK)",
            message = "riskStatus must be ON_TRACK, AT_RISK or OFF_TRACK")
    private String riskStatus;

    @Size(max = 500)
    private String riskReason;

    @PositiveOrZero
    private Integer delayDays;

    /** Semi-colon-separated dependency labels — replaces existing ones when provided. */
    private List<String> dependencies;
}
