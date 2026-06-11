package com.hranalytics.hrbackend.dto;

import java.util.List;
import java.util.Map;

public record DashboardRhDTO(
        long effectifTotal,
        double ancienneteMoyenneAnnees,
        Map<String, Long> repartitionParDepartement,
        Map<String, Long> repartitionParGenre,
        List<AgeGroupDTO> pyramideAges,
        List<DepartementEvaluationDTO> evaluationsParDepartement,
        double soldeCongeMoyen) {}
