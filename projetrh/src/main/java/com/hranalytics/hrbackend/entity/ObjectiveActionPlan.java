package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@Entity
@Table(name = "objective_action_plans")
public class ObjectiveActionPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "action_plan_id")
    private Long actionPlanId;

    @Column(name = "objective_id", nullable = false)
    private Long objectiveId;

    @Column(name = "action_type", nullable = false)
    private String actionType;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "details")
    private String details;

    @Column(name = "owner_employee_id")
    private Integer ownerEmployeeId;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
