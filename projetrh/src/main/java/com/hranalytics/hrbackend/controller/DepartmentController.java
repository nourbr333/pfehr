package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.DepartmentEmployeeDTO;
import com.hranalytics.hrbackend.dto.DepartmentStatsDTO;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.service.DepartmentService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/departments")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping
    public List<Department> getAllDepartments() {
        return departmentService.getAllDepartments();
    }

    @GetMapping("/stats")
    public List<DepartmentStatsDTO> getAllDepartmentStats() {
        return departmentService.getAllDepartmentStats();
    }

    @GetMapping("/{id}/stats")
    public DepartmentStatsDTO getDepartmentStatsById(@PathVariable Integer id) {
        return departmentService.getDepartmentStatsById(id);
    }

    @GetMapping("/{id}/employees")
    public List<DepartmentEmployeeDTO> getDepartmentEmployees(@PathVariable Integer id) {
        return departmentService.getDepartmentEmployees(id);
    }
}
