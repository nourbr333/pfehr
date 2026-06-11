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
@Table(name = "objective_milestones")
public class ObjectiveMilestone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "milestone_id")
    private Long milestoneId;

    @Column(name = "objective_id", nullable = false)
    private Long objectiveId;

    @Column(name = "label", nullable = false)
    private String label;

    @Column(name = "planned_date", nullable = false)
    private LocalDate plannedDate;

    @Column(name = "actual_date")
    private LocalDate actualDate;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "variance_days", nullable = false)
    private Integer varianceDays;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
