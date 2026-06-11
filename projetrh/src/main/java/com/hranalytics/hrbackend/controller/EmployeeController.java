package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.EmployeeDTO;
import com.hranalytics.hrbackend.dto.EmployeeImportRowDTO;
import com.hranalytics.hrbackend.dto.EmployeeImportSummaryDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.service.EmployeeService;
import com.hranalytics.hrbackend.util.PaginationSupport;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EmployeeController {

    private final EmployeeService employeeService;

    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping
    public PageResponse<EmployeeDTO> getAllEmployees(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer departmentId,
            @RequestParam(defaultValue = "false") boolean unpaged
    ) {
        if (!unpaged && size <= 0) {
            size = PaginationSupport.DEFAULT_SIZE;
        }
        return employeeService.getEmployeesPage(page, size, search, departmentId, unpaged);
    }

    @GetMapping("/managers")
    public List<EmployeeDTO> getManagers() {
        return employeeService.getManagers();
    }

    @GetMapping("/{id}")
    public EmployeeDTO getEmployeeById(@PathVariable Integer id) {
        return employeeService.getEmployeeById(id);
    }

    @GetMapping("/search")
    public List<EmployeeDTO> searchByName(@RequestParam String name) {
        return employeeService.searchByName(name);
    }

    @GetMapping("/department/{departmentId}")
    public List<EmployeeDTO> filterByDepartment(@PathVariable Integer departmentId) {
        return employeeService.filterByDepartment(departmentId);
    }

    @PostMapping("/import-excel")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public EmployeeImportSummaryDTO importExcel(@RequestParam("file") MultipartFile file) {
        return employeeService.importExcel(file);
    }

    @PostMapping("/import-rows")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public EmployeeImportSummaryDTO importRows(@RequestBody List<EmployeeImportRowDTO> rows) {
        return employeeService.importRows(rows);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public EmployeeDTO updateEmployee(@PathVariable Integer id, @RequestBody EmployeeDTO payload) {
        return employeeService.updateEmployee(id, payload);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Integer id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }
}
