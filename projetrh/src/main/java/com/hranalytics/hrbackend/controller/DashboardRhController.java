package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.DashboardRhDTO;
import com.hranalytics.hrbackend.service.DashboardRhService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard/rh")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class DashboardRhController {

    private final DashboardRhService dashboardRhService;

    public DashboardRhController(DashboardRhService dashboardRhService) {
        this.dashboardRhService = dashboardRhService;
    }

    @GetMapping("/summary")
    public DashboardRhDTO getSummary(
            @RequestParam(required = false) Integer departmentId,
            @RequestParam(required = false) String ageBracket,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String search) {
        return dashboardRhService.getSummary(departmentId, ageBracket, gender, search);
    }
}
