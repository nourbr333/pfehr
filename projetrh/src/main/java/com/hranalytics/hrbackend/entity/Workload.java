package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

@Data
@Entity
@Table(name = "workload")
public class Workload {

    @Id
    @Column(name = "workload_id")
    private Integer workloadId;

    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "projects_assigned")
    private Integer projectsAssigned;

    @Column(name = "projects_completed")
    private Integer projectsCompleted;

    @Column(name = "tasks_assigned")
    private Integer tasksAssigned;

    @Column(name = "tasks_completed")
    private Integer tasksCompleted;

    @Column(name = "average_task_completion_time")
    private Double averageTaskCompletionTime;
}
