package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

@Data
@Entity
@Table(name = "employee_coverage_profiles")
public class EmployeeCoverageProfile {

    @Id
    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "critical_role", nullable = false)
    private Boolean criticalRole;

    @Column(name = "role_label")
    private String roleLabel;

    @Column(name = "backup_employee_id")
    private Integer backupEmployeeId;
}
