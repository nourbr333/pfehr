package com.hranalytics.hrbackend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DepartmentPerformanceAggregateDTO {
    private double averagePerformanceScore;
    private double averageAttendanceRate;
    private int evaluatedEmployees;
}
