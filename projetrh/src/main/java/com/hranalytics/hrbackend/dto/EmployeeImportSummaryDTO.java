package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class EmployeeImportSummaryDTO {
    private int importedRows;
    private int createdEmployees;
    private List<Integer> importedEmployeeIds;
}
