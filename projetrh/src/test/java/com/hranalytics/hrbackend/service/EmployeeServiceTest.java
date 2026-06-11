package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.EmployeeDTO;
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

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceTest {

    @Mock
    private EmployeeRepository employeeRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private LeaveBalanceService leaveBalanceService;

    @InjectMocks
    private EmployeeService employeeService;

    @Test
    void updateEmployee_throwsWhenDuplicateEmail() {
        Employee employee = new Employee();
        employee.setEmployeeId(1);
        employee.setEmail("old@test.com");

        EmployeeDTO payload = new EmployeeDTO();
        payload.setEmail("duplicate@test.com");

        when(employeeRepository.findById(1)).thenReturn(Optional.of(employee));
        when(employeeRepository.existsByEmployeeIdNotAndEmailIgnoreCase(1, "duplicate@test.com")).thenReturn(true);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> employeeService.updateEmployee(1, payload)
        );

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals("Cet email est déjà utilisé par un autre employé", ex.getReason());
    }

    @Test
    void deleteEmployee_throwsWhenNotFound() {
        when(employeeRepository.existsById(99)).thenReturn(false);

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> employeeService.deleteEmployee(99)
        );

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        assertEquals("Employé introuvable", ex.getReason());
    }
}
