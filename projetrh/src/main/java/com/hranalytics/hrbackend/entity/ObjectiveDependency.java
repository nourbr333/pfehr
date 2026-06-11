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
@Table(name = "objective_dependencies")
public class ObjectiveDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "dependency_id")
    private Long dependencyId;

    @Column(name = "objective_id", nullable = false)
    private Long objectiveId;

    @Column(name = "blocking_source", nullable = false)
    private String blockingSource;

    @Column(name = "blocking_team")
    private String blockingTeam;

    @Column(name = "blocking_status", nullable = false)
    private String blockingStatus;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
}
