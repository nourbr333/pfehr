package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.Data;

@Data
public class ManagerOkrDashboardDTO {
    private List<ManagerObjectiveDTO> objectives;
    private List<ManagerObjectiveMilestoneDTO> milestones;
}
