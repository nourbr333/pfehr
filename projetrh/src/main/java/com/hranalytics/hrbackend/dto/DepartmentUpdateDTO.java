package com.hranalytics.hrbackend.dto;

import lombok.Data;

/** Mise à jour partielle : seuls les champs non-nuls fournis sont appliqués. */
@Data
public class DepartmentUpdateDTO {
    private String departmentName;
    private String departmentHead;
    private String description;
    private Boolean active;
}
