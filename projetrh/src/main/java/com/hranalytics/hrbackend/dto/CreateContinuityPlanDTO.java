package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateContinuityPlanDTO {
    @NotNull
    @Positive
    private Long requestId;

    @Positive
    private Integer backupEmployeeId;

    @Size(max = 1000)
    private String notes;
}
