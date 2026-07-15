package com.hranalytics.hrbackend.dto;

import lombok.Data;

@Data
public class DepartmentCreateDTO {
    private String departmentName;
    private String departmentHead;
    private String description;
    /** Par défaut, un nouveau département est actif. */
    private Boolean active;
}
