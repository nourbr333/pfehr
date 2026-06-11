package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import lombok.Data;

@Data
public class EmployeeDTO {
    private Integer employeeId;
    private String firstName;
    private String lastName;
    private String email;
    private String gender;
    private LocalDate dateOfBirth;
    private String maritalStatus;
    private String jobTitle;
    private LocalDate hireDate;
    private Integer managerId;
    private Integer departmentId;
    private String departmentName;
    /** Vrai si l'employé est manager (peut avoir des subordonnés). */
    private Boolean isManager;
}
