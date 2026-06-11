package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import lombok.Data;

@Data
public class EmployeeEvaluationDTO {
    @Positive
    private Integer evaluationId;

    @Positive
    private Integer employeeId;

    @NotNull
    @Positive
    private Integer managerId;

    private LocalDate evaluatedAt;

    @Size(max = 100)
    private String period;

    @Size(max = 4000)
    private String objectifs;

    @Size(max = 4000)
    private String summary;

    @Size(max = 4000)
    private String comments;

    @Min(0)
    @Max(100)
    private Integer rating;
}
