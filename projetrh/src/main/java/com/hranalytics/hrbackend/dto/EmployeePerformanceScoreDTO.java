package com.hranalytics.hrbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class EmployeePerformanceScoreDTO {
    private Integer employeeId;
    private Double performanceScore;
}
