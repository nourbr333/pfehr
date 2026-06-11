package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class EvaluationImportRowDTO {
    @NotNull
    private Integer employeeId;

    private String period;
    private String objectifs;
    private String comments;
    private String evaluatedAt;

    @NotNull
    @Min(0)
    @Max(100)
    private Integer rating;
}
