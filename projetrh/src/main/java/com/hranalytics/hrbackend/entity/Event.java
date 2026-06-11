package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import lombok.Data;

@Data
@Entity
@Table(name = "events")
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "event_id")
    private Long eventId;

    @Column(name = "title", nullable = false, length = 180)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "event_date", nullable = false)
    private LocalDate eventDate;

    @Column(name = "event_time")
    private LocalTime eventTime;

    @Column(name = "event_type", nullable = false, length = 40)
    private String eventType;

    @Column(name = "target_type", nullable = false, length = 40)
    private String targetType;

    @Column(name = "target_department_id")
    private Integer targetDepartmentId;

    @Column(name = "target_job_title", length = 120)
    private String targetJobTitle;

    @Column(name = "target_employee_ids")
    private String targetEmployeeIds;

    @Column(name = "created_by_employee_id")
    private Integer createdByEmployeeId;

    @Column(name = "created_by_name", length = 180)
    private String createdByName;

    @Column(name = "created_by_role", length = 120)
    private String createdByRole;

    @Column(name = "annule", nullable = false)
    private Boolean annule = Boolean.FALSE;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
