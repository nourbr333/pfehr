package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Data;

@Data
@Entity
@Table(name = "attendance")
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "attendance_seq")
    @SequenceGenerator(name = "attendance_seq", sequenceName = "attendance_attendance_id_seq", allocationSize = 1)
    @Column(name = "attendance_id")
    private Integer attendanceId;

    @Column(name = "employee_id")
    private Integer employeeId;

    @Column(name = "attendance_date")
    private LocalDate attendanceDate;

    @Column(name = "is_present")
    private Boolean isPresent;

    @Column(name = "is_late")
    private Boolean isLate;

    @Column(name = "overtime_hours")
    private Double overtimeHours;
}
