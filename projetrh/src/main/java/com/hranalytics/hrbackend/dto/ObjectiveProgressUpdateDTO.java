package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class ObjectiveProgressUpdateDTO {
    @Positive
    private Integer authorEmployeeId;

    @DecimalMin(value = "0.0")
    @DecimalMax(value = "100.0")
    private BigDecimal progressPercent;

    @Size(max = 1000)
    private String commentText;
}
