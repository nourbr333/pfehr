package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;

public class LeaveBalanceDto {
    private Integer id;
    private Integer employeeId;
    private String employeeName;
    private String type;
    private Integer year;
    private Double entitled;
    private Double used;
    private Double pending;
    private Double remaining;
    private Double carryOver;
    private LocalDate expiresAt;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public Integer getEmployeeId() { return employeeId; }
    public void setEmployeeId(Integer employeeId) { this.employeeId = employeeId; }

    public String getEmployeeName() { return employeeName; }
    public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }

    public Double getEntitled() { return entitled; }
    public void setEntitled(Double entitled) { this.entitled = entitled; }

    public Double getUsed() { return used; }
    public void setUsed(Double used) { this.used = used; }

    public Double getPending() { return pending; }
    public void setPending(Double pending) { this.pending = pending; }

    public Double getRemaining() { return remaining; }
    public void setRemaining(Double remaining) { this.remaining = remaining; }

    public Double getCarryOver() { return carryOver; }
    public void setCarryOver(Double carryOver) { this.carryOver = carryOver; }

    public LocalDate getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDate expiresAt) { this.expiresAt = expiresAt; }
}
