package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import lombok.Data;

@Data
public class ManagerObjectiveMilestoneDTO {
    private Long milestoneId;
    private Long objectiveId;
    private String objectiveCode;
    private String objectiveTitle;
    private String ownerName;
    private String label;
    private LocalDate plannedDate;
    private LocalDate actualDate;
    private String status;
    private Integer varianceDays;
}
