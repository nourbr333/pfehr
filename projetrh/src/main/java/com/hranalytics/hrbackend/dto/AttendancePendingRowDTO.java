package com.hranalytics.hrbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDate;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AttendancePendingRowDTO {
    private Integer employeeId;
    private LocalDate attendanceDate;
    private Boolean isPresent;
    private Boolean isLate;
    private Double overtimeHours;
}
