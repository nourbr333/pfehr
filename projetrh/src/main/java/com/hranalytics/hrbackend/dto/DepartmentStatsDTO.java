package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class DepartmentStatsDTO {
    private Integer departmentId;
    private String departmentName;
    private Integer employeeCount;
    private Integer evaluatedEmployees;
    private Double averagePerformanceScore;
    private Double averageAttendanceRate;
}
