package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class ManagerAdvancedAbsenceDashboardDTO {
    private String viewMode;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private Integer simultaneousAbsenceThreshold;
    private Integer totalTeamMembers;
    private Integer activeApprovedAbsences;
    private Integer cumulativeAbsenceDays;
    private Integer prevMonthAbsenceDays;
    private Double prevMonthAbsenceRate;
    private Double attendanceAbsenceRate;
    private Double prevAttendanceAbsenceRate;
    private List<CalendarAbsenceDTO> calendarAbsences;
    private List<CoverageAlertDTO> coverageAlerts;
    private List<ProjectImpactDTO> projectImpacts;
    private RequestPipelineDTO pipeline;
    private List<EmployeeChoiceDTO> teamBackups;

    @Data
    public static class CalendarAbsenceDTO {
        private Long requestId;
        private Integer employeeId;
        private String employeeName;
        private String roleLabel;
        private String absenceType;
        private String status;
        private LocalDate startDate;
        private LocalDate endDate;
        private Boolean criticalRole;
        private Boolean backupAssigned;
        private String backupEmployeeName;
    }

    @Data
    public static class CoverageAlertDTO {
        private String alertType;
        private String severity;
        private String title;
        private String description;
        private LocalDate day;
        private Long requestId;
        private Integer impactedCount;
    }

    @Data
    public static class ProjectImpactDTO {
        private Long objectiveId;
        private String objectiveCode;
        private String objectiveTitle;
        private String itemType;
        private String riskStatus;
        private String ownerName;
        private Long relatedRequestId;
        private LocalDate absenceStart;
        private LocalDate absenceEnd;
        private String impactReason;
        // Cross-module enrichment fields
        private Integer progressPercent;
        private Integer delayDays;
        private LocalDate dueDate;
        private Integer affectedMembersCount;
        private Integer totalMembersCount;
        private Double capacityRiskPercent;
        private List<AffectedMemberDTO> affectedMembers;
        // Backup coverage
        private Boolean backupAssigned;
        private String backupName;
    }

    @Data
    public static class AffectedMemberDTO {
        private Integer employeeId;
        private String employeeName;
        private LocalDate absenceStart;
        private LocalDate absenceEnd;
        private String absenceType;
    }

    @Data
    public static class RequestPipelineDTO {
        private Integer pendingCount;
        private Integer approvedCount;
        private Integer refusedCount;
        private List<PipelineRequestDTO> requests;
    }

    @Data
    public static class PipelineRequestDTO {
        private Long requestId;
        private Integer employeeId;
        private String employeeName;
        private String absenceType;
        private String status;
        private LocalDate startDate;
        private LocalDate endDate;
        private String reason;
        private LocalDateTime requestedAt;
        private Boolean conflictsDetected;
    }

    @Data
    public static class EmployeeChoiceDTO {
        private Integer employeeId;
        private String employeeName;
        private String roleLabel;
    }
}
