package com.hranalytics.hrbackend.dto;

import java.util.List;

public class LeaveConflictDto {
    private String department;
    private List<String> overlappingEmployees;
    private Integer absenceCount;
    private Integer departmentHeadcount;
    private Double absenceRate;
    private Boolean exceedsThreshold;

    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }

    public List<String> getOverlappingEmployees() { return overlappingEmployees; }
    public void setOverlappingEmployees(List<String> overlappingEmployees) { this.overlappingEmployees = overlappingEmployees; }

    public Integer getAbsenceCount() { return absenceCount; }
    public void setAbsenceCount(Integer absenceCount) { this.absenceCount = absenceCount; }

    public Integer getDepartmentHeadcount() { return departmentHeadcount; }
    public void setDepartmentHeadcount(Integer departmentHeadcount) { this.departmentHeadcount = departmentHeadcount; }

    public Double getAbsenceRate() { return absenceRate; }
    public void setAbsenceRate(Double absenceRate) { this.absenceRate = absenceRate; }

    public Boolean getExceedsThreshold() { return exceedsThreshold; }
    public void setExceedsThreshold(Boolean exceedsThreshold) { this.exceedsThreshold = exceedsThreshold; }
}
