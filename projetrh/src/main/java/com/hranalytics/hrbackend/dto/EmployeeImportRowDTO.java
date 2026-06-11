package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class EmployeeImportRowDTO {
    private String firstName;
    private String lastName;
    private String email;
    private String gender;
    private String dateOfBirth;
    private String maritalStatus;
    private Integer departmentId;
    private String departmentName;
    private String jobTitle;
    private String hireDate;
    private Integer managerId;
}
