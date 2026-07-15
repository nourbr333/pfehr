package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.DepartmentCreateDTO;
import com.hranalytics.hrbackend.dto.DepartmentEmployeeDTO;
import com.hranalytics.hrbackend.dto.DepartmentStatsDTO;
import com.hranalytics.hrbackend.dto.DepartmentUpdateDTO;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.service.DepartmentService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
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

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public ResponseEntity<Department> createDepartment(@RequestBody DepartmentCreateDTO payload) {
        Department created = departmentService.createDepartment(payload);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public Department updateDepartment(@PathVariable Integer id, @RequestBody DepartmentUpdateDTO payload) {
        return departmentService.updateDepartment(id, payload);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public ResponseEntity<Void> deleteDepartment(@PathVariable Integer id) {
        departmentService.deleteDepartment(id);
        return ResponseEntity.noContent().build();
    }
}
