package com.hranalytics.hrbackend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;

@Data
public class CreateTeamObjectiveDTO {
    @Size(max = 100)
    private String objectiveCode;

    @NotBlank
    @Size(max = 255)
    private String title;

    @Pattern(regexp = "(?i)(TEAM|INDIVIDUAL)", message = "objectiveScope must be TEAM or INDIVIDUAL")
    private String objectiveScope;

    @NotNull
    @Positive
    private Integer ownerEmployeeId;

    /** For TEAM scope: list of member employee IDs to create one objective per member. */
    @Valid
    @Size(max = 50)
    private List<@Positive Integer> memberEmployeeIds;

    @Size(max = 100)
    private String horizonLabel;

    private LocalDate dueDate;

    @DecimalMin(value = "0.0")
    @DecimalMax(value = "100.0")
    private BigDecimal progressPercent;

    @DecimalMin(value = "0.0", inclusive = false)
    private BigDecimal weighting;

    @Size(max = 50)
    private List<@Size(max = 255) String> dependencies;
}
