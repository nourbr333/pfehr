package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@Entity
@Table(name = "objective_progress_updates")
public class ObjectiveProgressUpdate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "update_id")
    private Long updateId;

    @Column(name = "objective_id", nullable = false)
    private Long objectiveId;

    @Column(name = "author_employee_id", nullable = false)
    private Integer authorEmployeeId;

    @Column(name = "progress_percent", nullable = false)
    private BigDecimal progressPercent;

    @Column(name = "comment_text")
    private String commentText;

    @Column(name = "risk_status")
    private String riskStatus;

    @Column(name = "risk_reason")
    private String riskReason;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
