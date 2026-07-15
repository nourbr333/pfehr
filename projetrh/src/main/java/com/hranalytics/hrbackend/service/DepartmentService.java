package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.DepartmentCreateDTO;
import com.hranalytics.hrbackend.dto.DepartmentEmployeeDTO;
import com.hranalytics.hrbackend.dto.DepartmentPerformanceAggregateDTO;
import com.hranalytics.hrbackend.dto.DepartmentStatsDTO;
import com.hranalytics.hrbackend.dto.DepartmentUpdateDTO;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.DepartmentRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.time.LocalDateTime;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final EmployeeRepository employeeRepository;
    private final PerformanceScoreService performanceScoreService;

    public DepartmentService(
            DepartmentRepository departmentRepository,
            EmployeeRepository employeeRepository,
            PerformanceScoreService performanceScoreService) {
        this.departmentRepository = departmentRepository;
        this.employeeRepository = employeeRepository;
        this.performanceScoreService = performanceScoreService;
    }

    public List<Department> getAllDepartments() {
        Map<Integer, Long> countByDepartmentId = employeeRepository.countGroupedByDepartment().stream()
                .collect(Collectors.toMap(
                        row -> (Integer) row[0],
                        row -> (Long) row[1]));
        return departmentRepository.findAll().stream()
                .map(source -> withDynamicEmployeeCount(source, countByDepartmentId))
                .toList();
    }

    public List<DepartmentStatsDTO> getAllDepartmentStats() {
        return departmentRepository.findAll().stream().map(this::buildDepartmentStats).toList();
    }

    public DepartmentStatsDTO getDepartmentStatsById(Integer departmentId) {
        @SuppressWarnings("null")
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId));
        return buildDepartmentStats(department);
    }

    public Department createDepartment(DepartmentCreateDTO payload) {
        if (payload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le corps de la requête est obligatoire");
        }
        String name = requiredText(payload.getDepartmentName(), "departmentName");
        if (departmentRepository.existsByDepartmentNameIgnoreCase(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un département porte déjà ce nom");
        }

        Department department = new Department();
        department.setDepartmentId(departmentRepository.findMaxDepartmentId() + 1);
        department.setDepartmentName(name);
        department.setDepartmentHead(blankToNull(payload.getDepartmentHead()));
        department.setDescription(blankToNull(payload.getDescription()));
        department.setActive(payload.getActive() == null ? Boolean.TRUE : payload.getActive());
        department.setCreatedAt(LocalDateTime.now());
        return departmentRepository.save(department);
    }

    public Department updateDepartment(Integer departmentId, DepartmentUpdateDTO payload) {
        if (departmentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Department id cannot be null");
        }
        if (payload == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le corps de la requête est obligatoire");
        }
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId));

        if (payload.getDepartmentName() != null) {
            String name = requiredText(payload.getDepartmentName(), "departmentName");
            if (departmentRepository.existsByDepartmentIdNotAndDepartmentNameIgnoreCase(departmentId, name)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Un département porte déjà ce nom");
            }
            department.setDepartmentName(name);
        }
        if (payload.getDepartmentHead() != null) {
            department.setDepartmentHead(blankToNull(payload.getDepartmentHead()));
        }
        if (payload.getDescription() != null) {
            department.setDescription(blankToNull(payload.getDescription()));
        }
        if (payload.getActive() != null) {
            department.setActive(payload.getActive());
        }
        department.setUpdatedAt(LocalDateTime.now());
        return departmentRepository.save(department);
    }

    public void deleteDepartment(Integer departmentId) {
        if (departmentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Department id cannot be null");
        }
        if (!departmentRepository.existsById(departmentId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId);
        }

        int remainingEmployees = employeeRepository.findByDepartment_DepartmentId(departmentId).size();
        if (remainingEmployees > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Impossible de supprimer ce département : " + remainingEmployees
                            + " employé(s) y sont encore affecté(s).");
        }

        try {
            departmentRepository.deleteById(departmentId);
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Impossible de supprimer ce département : il est encore référencé par d'autres données.");
        }
    }

    private String requiredText(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " est obligatoire");
        }
        return value.trim();
    }

    private String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    public List<DepartmentEmployeeDTO> getDepartmentEmployees(Integer departmentId) {
        @SuppressWarnings("null")
        boolean exists = departmentRepository.existsById(departmentId);
        if (!exists) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Department not found with id: " + departmentId);
        }

        return employeeRepository.findByDepartment_DepartmentId(departmentId).stream()
                .map(this::toDepartmentEmployeeDto)
                .toList();
    }

    private DepartmentStatsDTO buildDepartmentStats(Department department) {
        List<Employee> employees = employeeRepository.findByDepartment_DepartmentId(department.getDepartmentId());
        List<Integer> employeeIds = employees.stream().map(Employee::getEmployeeId).toList();

        DepartmentStatsDTO dto = new DepartmentStatsDTO();
        dto.setDepartmentId(department.getDepartmentId());
        dto.setDepartmentName(department.getDepartmentName());
        dto.setEmployeeCount(employees.size());

        DepartmentPerformanceAggregateDTO aggregate = performanceScoreService.aggregateForEmployees(employeeIds);
        dto.setEvaluatedEmployees(aggregate.getEvaluatedEmployees());
        dto.setAveragePerformanceScore(aggregate.getAveragePerformanceScore());
        dto.setAverageAttendanceRate(aggregate.getAverageAttendanceRate());
        return dto;
    }

    private DepartmentEmployeeDTO toDepartmentEmployeeDto(Employee employee) {
        DepartmentEmployeeDTO dto = new DepartmentEmployeeDTO();
        dto.setEmployeeId(employee.getEmployeeId());
        dto.setFirstName(employee.getFirstName());
        dto.setLastName(employee.getLastName());
        dto.setJobTitle(employee.getJobTitle());
        return dto;
    }

    private Department withDynamicEmployeeCount(Department source, Map<Integer, Long> countByDepartmentId) {
        Integer departmentId = source.getDepartmentId();
        Department department = new Department();
        department.setDepartmentId(departmentId);
        department.setDepartmentName(source.getDepartmentName());
        department.setDepartmentHead(source.getDepartmentHead());
        department.setDescription(source.getDescription());
        department.setActive(source.getActive());
        department.setCreatedAt(source.getCreatedAt());
        department.setUpdatedAt(source.getUpdatedAt());
        int employeeCount = departmentId == null
                ? 0
                : countByDepartmentId.getOrDefault(departmentId, 0L).intValue();
        department.setEmployeeCount(employeeCount);
        return department;
    }
}
