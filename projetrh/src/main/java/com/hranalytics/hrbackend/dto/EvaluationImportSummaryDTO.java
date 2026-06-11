package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class EvaluationImportSummaryDTO {
    private Integer importedRows;
    private Integer affectedEmployees;
    private List<Integer> importedEmployeeIds;
    private List<Integer> skippedEmployeeIds;
}
