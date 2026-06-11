package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import lombok.Data;

@Data
public class AttendanceDTO {
    private Integer attendanceId;
    private Integer employeeId;
    private LocalDate attendanceDate;
    private Boolean isPresent;
    private Boolean isLate;
    private Double overtimeHours;
}
