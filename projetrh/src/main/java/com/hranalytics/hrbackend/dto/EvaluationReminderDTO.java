package com.hranalytics.hrbackend.dto;

import java.time.OffsetDateTime;

public class EvaluationReminderDTO {

    private Long notificationId;
    private Integer employeeId;
    private String employeeName;
    private String managerName;
    private OffsetDateTime sentAt;
    /** "Traité" if manager evaluated after reminder; "Non traité" otherwise. */
    private String status;

    public Long getNotificationId() { return notificationId; }
    public void setNotificationId(Long notificationId) { this.notificationId = notificationId; }

    public Integer getEmployeeId() { return employeeId; }
    public void setEmployeeId(Integer employeeId) { this.employeeId = employeeId; }

    public String getEmployeeName() { return employeeName; }
    public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }

    public String getManagerName() { return managerName; }
    public void setManagerName(String managerName) { this.managerName = managerName; }

    public OffsetDateTime getSentAt() { return sentAt; }
    public void setSentAt(OffsetDateTime sentAt) { this.sentAt = sentAt; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
