package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@Entity
@Table(name = "team_objectives")
public class TeamObjective {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "objective_id")
    private Long objectiveId;

    @Column(name = "objective_code", nullable = false)
    private String objectiveCode;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "objective_scope", nullable = false)
    private String objectiveScope;

    @Column(name = "owner_employee_id", nullable = false)
    private Integer ownerEmployeeId;

    @Column(name = "manager_employee_id", nullable = false)
    private Integer managerEmployeeId;

    @Column(name = "horizon_label", nullable = false)
    private String horizonLabel;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "progress_percent", nullable = false)
    private BigDecimal progressPercent;

    @Column(name = "risk_status", nullable = false)
    private String riskStatus;

    @Column(name = "risk_reason")
    private String riskReason;

    @Column(name = "weighting", nullable = false)
    private BigDecimal weighting;

    @Column(name = "delay_days", nullable = false)
    private Integer delayDays;

    @Column(name = "last_update_at", nullable = false)
    private LocalDateTime lastUpdateAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
