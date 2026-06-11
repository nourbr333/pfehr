package com.hranalytics.hrbackend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class ManagerObjectiveDTO {
    private Long objectiveId;
    private String objectiveCode;
    private String title;
    private String objectiveScope;
    private Integer ownerEmployeeId;
    private String ownerName;
    private Integer managerId;
    private String managerName;
    /** For TEAM scope: all member employee IDs assigned to this objective. */
    private List<Integer> memberEmployeeIds;
    /** For TEAM scope: all member names joined by ", ". */
    private List<String> memberNames;
    private String teamName;
    private String horizonLabel;
    private LocalDate dueDate;
    private BigDecimal progressPercent;
    private BigDecimal weighting;
    private String riskStatus;
    private String riskReason;
    private Integer delayDays;
    private LocalDateTime lastUpdateAt;
    private List<String> dependencies;
}
