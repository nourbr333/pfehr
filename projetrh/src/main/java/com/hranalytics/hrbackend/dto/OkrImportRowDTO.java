package com.hranalytics.hrbackend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;

@Data
public class OkrImportRowDTO {
    /** 1-based row index in the source file (for display). */
    private int rowIndex;

    private String title;
    private String objectiveScope;
    private Integer ownerEmployeeId;
    /** TEAM : tous les IDs parsés depuis owner_employee_id (séparateur ; ou ,). */
    private List<Integer> memberEmployeeIds;
    /** Resolved full name of the owner — populated during preview, not required for commit. */
    private String ownerName;
    private String horizonLabel;
    private LocalDate dueDate;
    /** Optional — date de début réelle (imports historiques). Si absent, date d'import. */
    private LocalDate createdAt;
    private BigDecimal progressPercent;
    private BigDecimal weighting;
    /** Semi-colon-separated dependency labels (e.g. "Équipe IT;Validation RH"). */
    private String dependencies;

    /** Whether this row passed all validations. */
    private boolean valid;
    /** Human-readable validation error messages. Empty if valid. */
    private List<String> errors;
}
