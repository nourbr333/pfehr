package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.Data;

@Data
public class CreateObjectiveActionPlanDTO {
    @Pattern(
            regexp = "(?i)(REPLAN|ESCALATE|CAPACITY_REINFORCEMENT)",
            message = "actionType must be REPLAN, ESCALATE or CAPACITY_REINFORCEMENT")
    private String actionType;

    @NotBlank
    @Size(max = 255)
    private String title;

    @Size(max = 2000)
    private String details;

    @Positive
    private Integer ownerEmployeeId;

    private LocalDate dueDate;

    @Size(max = 50)
    private String status;
}
