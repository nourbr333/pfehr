package com.hranalytics.hrbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDate;
import java.util.List;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AttendanceImportSummaryDTO {
    private Integer importedRows;
    private Integer affectedEmployees;
    private List<Integer> importedEmployeeIds;
    private List<Integer> skippedEmployeeIds;
    private LocalDate periodStart;
    private LocalDate periodEnd;
}
