package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import lombok.Data;

@Data
public class EventUpsertRequestDTO {
    @NotBlank
    @Size(max = 180)
    private String title;

    private String description;

    @NotNull
    private LocalDate eventDate;

    private LocalTime eventTime;

    @NotBlank
    private String eventType;

    @NotBlank
    private String targetType;

    private Integer targetDepartmentId;
    private String targetJobTitle;
    private List<Integer> targetEmployeeIds;
    private Integer createdByEmployeeId;
    private String createdByName;
    private String createdByRole;
}
