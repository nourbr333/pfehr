package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class DepartmentEmployeeDTO {
    private Integer employeeId;
    private String firstName;
    private String lastName;
    private String jobTitle;
}
