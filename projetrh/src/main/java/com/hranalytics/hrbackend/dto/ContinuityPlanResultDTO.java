package com.hranalytics.hrbackend.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ContinuityPlanResultDTO {
    private Long planId;
    private Integer requestId;
    private Integer employeeId;
    private String employeeName;
    private Integer backupEmployeeId;
    private String backupEmployeeName;
    private String status;
    private String notes;
    private LocalDateTime createdAt;
}
