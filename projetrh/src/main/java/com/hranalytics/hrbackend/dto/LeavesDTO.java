package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class LeavesDTO {
    private Integer leaveId;
    private Integer employeeId;
    private String firstName;
    private String lastName;
    private String fullName;
    private String departmentName;
    private String jobTitle;
    private Integer leaveDaysTaken;
    private Integer leaveDaysRemaining;
    private Integer absencesDays;
    private Double attendanceRate;
}
