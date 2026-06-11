package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public class LeaveRequestDto {
    private Integer id;
    private Integer employeeId;
    private String employeeName;
    private String employeeAvatar;
    private String department;
    private String type;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer requestedDays;
    private String status;
    private OffsetDateTime requestedAt;
    private Integer reviewedBy;
    private OffsetDateTime reviewedAt;
    private String rejectionReason;
    private String notes;
    private Boolean conflictsDetected;
    private List<LeaveConflictDto> conflictDetails;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getEmployeeId() { return employeeId; }
    public void setEmployeeId(Integer employeeId) { this.employeeId = employeeId; }

    public String getEmployeeName() { return employeeName; }
    public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }

    public String getEmployeeAvatar() { return employeeAvatar; }
    public void setEmployeeAvatar(String employeeAvatar) { this.employeeAvatar = employeeAvatar; }

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }

    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }

    public Integer getRequestedDays() { return requestedDays; }
    public void setRequestedDays(Integer requestedDays) { this.requestedDays = requestedDays; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public OffsetDateTime getRequestedAt() { return requestedAt; }
    public void setRequestedAt(OffsetDateTime requestedAt) { this.requestedAt = requestedAt; }

    public Integer getReviewedBy() { return reviewedBy; }
    public void setReviewedBy(Integer reviewedBy) { this.reviewedBy = reviewedBy; }

    public OffsetDateTime getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(OffsetDateTime reviewedAt) { this.reviewedAt = reviewedAt; }

    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Boolean getConflictsDetected() { return conflictsDetected; }
    public void setConflictsDetected(Boolean conflictsDetected) { this.conflictsDetected = conflictsDetected; }

    public List<LeaveConflictDto> getConflictDetails() { return conflictDetails; }
    public void setConflictDetails(List<LeaveConflictDto> conflictDetails) { this.conflictDetails = conflictDetails; }
}
