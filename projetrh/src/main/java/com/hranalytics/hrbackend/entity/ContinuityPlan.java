package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@Entity
@Table(name = "continuity_plans")
public class ContinuityPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "plan_id")
    private Long planId;

    @Column(name = "manager_id", nullable = false)
    private Integer managerId;

    @Column(name = "request_id", nullable = false)
    private Integer requestId;

    @Column(name = "employee_id", nullable = false)
    private Integer employeeId;

    @Column(name = "backup_employee_id")
    private Integer backupEmployeeId;

    @Column(name = "plan_status", nullable = false)
    private String planStatus;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
