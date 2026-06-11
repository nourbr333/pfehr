package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import lombok.Data;

@Data
public class AttendanceManualUpdateRequest {

    @NotNull
    private LocalDate attendanceDate;

    @NotNull
    private Boolean isPresent;

    private Boolean isLate;

    private Double overtimeHours;

    /** Unused — kept to avoid breaking any JSON deserialization from old clients. */
    @Deprecated
    private LocalDate periodStart;

    /** Unused — kept to avoid breaking any JSON deserialization from old clients. */
    @Deprecated
    private LocalDate periodEnd;
}
