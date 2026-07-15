package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.DepartmentCreateDTO;
import com.hranalytics.hrbackend.dto.DepartmentUpdateDTO;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.DepartmentRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DepartmentServiceTest {

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private EmployeeRepository employeeRepository;

    @Mock
    private PerformanceScoreService performanceScoreService;

    @InjectMocks
    private DepartmentService departmentService;

    @Test
    void createDepartment_throwsWhenNameMissing() {
        DepartmentCreateDTO payload = new DepartmentCreateDTO();
        payload.setDepartmentName("   ");

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> departmentService.createDepartment(payload)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void createDepartment_throwsWhenDuplicateName() {
        DepartmentCreateDTO payload = new DepartmentCreateDTO();
        payload.setDepartmentName("Finance");

        when(departmentRepository.existsByDepartmentNameIgnoreCase("Finance")).thenReturn(true);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> departmentService.createDepartment(payload)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Un département porte déjà ce nom", ex.getReason());
    }

    @Test
    void updateDepartment_throwsWhenNotFound() {
        when(departmentRepository.findById(99)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> departmentService.updateDepartment(99, new DepartmentUpdateDTO())
        );

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void deleteDepartment_throwsWhenNotFound() {
        when(departmentRepository.existsById(99)).thenReturn(false);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> departmentService.deleteDepartment(99)
        );

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void deleteDepartment_throwsWhenEmployeesStillAssigned() {
        Employee employee = new Employee();
        employee.setEmployeeId(1);

        when(departmentRepository.existsById(5)).thenReturn(true);
        when(employeeRepository.findByDepartment_DepartmentId(5)).thenReturn(List.of(employee));

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> departmentService.deleteDepartment(5)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void deleteDepartment_succeedsWhenEmpty() {
        when(departmentRepository.existsById(5)).thenReturn(true);
        when(employeeRepository.findByDepartment_DepartmentId(5)).thenReturn(List.of());

        departmentService.deleteDepartment(5);
    }
}
