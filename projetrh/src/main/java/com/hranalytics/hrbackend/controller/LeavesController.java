package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.LeavesDTO;
import com.hranalytics.hrbackend.service.LeavesService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class LeavesController {

    private final LeavesService leavesService;

    public LeavesController(LeavesService leavesService) {
        this.leavesService = leavesService;
    }

    @GetMapping("/{employeeId}/leaves")
    public LeavesDTO getEmployeeLeaves(@PathVariable Integer employeeId) {
        return leavesService.findByEmployeeIdOrDefault(employeeId);
    }
}
