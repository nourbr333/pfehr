package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Data;

@Data
@Entity
@Table(name = "employee_evaluations")
public class EmployeeEvaluation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "evaluation_id")
    private Integer evaluationId;

    @Column(name = "employee_id", nullable = false)
    private Integer employeeId;

    @Column(name = "manager_id", nullable = false)
    private Integer managerId;

    @Column(name = "evaluated_at")
    private LocalDate evaluatedAt;

    @Column(name = "period")
    private String period;

    @Column(name = "objectif")
    private String objectif;

    @Column(name = "comments")
    private String comments;

    @Column(name = "rating")
    private Integer rating;
}
