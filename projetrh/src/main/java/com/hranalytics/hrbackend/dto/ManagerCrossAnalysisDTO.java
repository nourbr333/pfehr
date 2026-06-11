package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import java.util.List;
import lombok.Data;

/**
 * Result of the cross-module analysis: absences that may impact OKR objectives
 * within a 15-day window before each objective's due date.
 */
@Data
public class ManagerCrossAnalysisDTO {

    private List<ObjectiveAbsenceImpactDTO> objectiveAbsenceImpacts;

    @Data
    public static class ObjectiveAbsenceImpactDTO {
        private Long objectiveId;
        private String objectiveCode;
        private String objectiveTitle;
        private LocalDate dueDate;
        private Integer progressPercent;
        private Integer delayDays;
        private String riskStatus;
        /** "TEAM" or "INDIVIDUAL" */
        private String scope;
        private Integer totalMembers;
        private Integer affectedMembersCount;
        /** Percentage of team/owner absent in the [dueDate-15j, dueDate] window */
        private Double capacityRiskPercent;
        private List<AffectedMemberDTO> affectedMembers;
    }

    @Data
    public static class AffectedMemberDTO {
        private Integer employeeId;
        private String employeeName;
        private LocalDate absenceStart;
        private LocalDate absenceEnd;
        private String absenceType;
        private Long relatedRequestId;
    }
}
