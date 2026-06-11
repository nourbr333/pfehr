package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

@Data
@Entity
@Table(name = "team_objective_members")
public class TeamObjectiveMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "objective_id", nullable = false)
    private Long objectiveId;

    @Column(name = "employee_id", nullable = false)
    private Integer employeeId;
}
