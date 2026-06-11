package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class WorkloadDTO {
    private Integer workloadId;
    private Integer employeeId;
    private Integer projectsAssigned;
    private Integer projectsCompleted;
    private Integer tasksAssigned;
    private Integer tasksCompleted;
    private Double averageTaskCompletionTime;
}
