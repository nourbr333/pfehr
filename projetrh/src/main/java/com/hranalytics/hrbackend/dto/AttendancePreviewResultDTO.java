package com.hranalytics.hrbackend.dto;

import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class AttendancePreviewResultDTO {
    private Integer importedRows;
    private List<AttendancePendingRowDTO> rows;
    private List<Integer> skippedEmployeeIds;
    private LocalDate periodStart;
    private LocalDate periodEnd;
}
