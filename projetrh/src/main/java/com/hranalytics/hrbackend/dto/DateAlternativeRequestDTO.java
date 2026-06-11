package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.LocalDate;
import lombok.Data;

@Data
public class DateAlternativeRequestDTO {
    @NotNull
    @Positive
    private Long requestId;

    private LocalDate preferredStartDate;
    private LocalDate preferredEndDate;

    @Positive
    @Max(120)
    private Integer searchWindowDays;

    @Positive
    @Max(10)
    private Integer maxAlternatives;
}
