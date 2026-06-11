package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.WorkloadDTO;
import com.hranalytics.hrbackend.service.WorkloadService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EmployeeWorkloadController {

    private final WorkloadService workloadService;

    public EmployeeWorkloadController(WorkloadService workloadService) {
        this.workloadService = workloadService;
    }

    @GetMapping("/workload")
    public List<WorkloadDTO> listWorkload() {
        return workloadService.findAll();
    }

    @GetMapping("/{employeeId}/workload")
    public WorkloadDTO getEmployeeWorkload(@PathVariable Integer employeeId) {
        return workloadService.findByEmployeeIdOrDefault(employeeId);
    }
}
