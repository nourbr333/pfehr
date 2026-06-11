package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.LeavesDTO;
import com.hranalytics.hrbackend.entity.Attendance;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.AttendanceRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class LeavesService {

    private final EmployeeRepository employeeRepository;
    private final AttendanceRepository attendanceRepository;
    private final JdbcTemplate jdbc;

    public LeavesService(
            EmployeeRepository employeeRepository,
            AttendanceRepository attendanceRepository,
            JdbcTemplate jdbc) {
        this.employeeRepository = employeeRepository;
        this.attendanceRepository = attendanceRepository;
        this.jdbc = jdbc;
    }

    public LeavesDTO findByEmployeeIdOrDefault(Integer employeeId) {
        if (employeeId == null) {
            return defaultDto(null, null);
        }

        Employee employee = employeeRepository.findById(employeeId).orElse(null);
        LeaveBalance balance = findLeaveBalance(employeeId);
        List<Attendance> attendanceRows = attendanceRepository.findByEmployeeIdOrderByAttendanceDateAsc(employeeId);

        if (balance == null && employee == null && attendanceRows.isEmpty()) {
            return defaultDto(employeeId, null);
        }

        return toDto(employeeId, employee, balance, attendanceRows);
    }

    /**
     * Lit le solde de conges paye de l'annee courante depuis leave_balances
     * (source de verite). Remplace l'ancienne table 'leaves'.
     */
    private LeaveBalance findLeaveBalance(Integer employeeId) {
        int year = LocalDate.now().getYear();
        return jdbc.query(
                "SELECT id, "
                        + "COALESCE(used, 0) AS used, "
                        + "GREATEST(0, COALESCE(entitled, 0) + COALESCE(carry_over, 0) - COALESCE(used, 0) - COALESCE(pending, 0)) AS remaining "
                        + "FROM leave_balances WHERE type = 'conge-paye' AND employee_id = ? AND year = ? LIMIT 1",
                rs -> {
                    if (!rs.next()) {
                        return null;
                    }
                    LeaveBalance b = new LeaveBalance();
                    b.id = rs.getInt("id");
                    b.used = (int) Math.round(rs.getDouble("used"));
                    b.remaining = (int) Math.round(rs.getDouble("remaining"));
                    return b;
                },
                employeeId, year);
    }

    private LeavesDTO toDto(Integer employeeId, Employee employee, LeaveBalance balance, List<Attendance> rows) {
        LeavesDTO dto = new LeavesDTO();
        dto.setLeaveId(balance != null ? balance.id : 0);
        dto.setEmployeeId(employeeId);
        dto.setLeaveDaysTaken(balance != null ? balance.used : 0);
        dto.setLeaveDaysRemaining(balance != null ? balance.remaining : 0);
        long absentCount = rows.stream().filter(r -> !Boolean.TRUE.equals(r.getIsPresent())).count();
        double attRate = rows.isEmpty() ? 0.0
                : rows.stream().filter(r -> Boolean.TRUE.equals(r.getIsPresent())).count() * 100.0 / rows.size();
        dto.setAbsencesDays((int) absentCount);
        dto.setAttendanceRate(attRate);

        if (employee != null) {
            dto.setFirstName(safe(employee.getFirstName()));
            dto.setLastName(safe(employee.getLastName()));
            dto.setFullName((safe(employee.getFirstName()) + " " + safe(employee.getLastName())).trim());
            dto.setJobTitle(safe(employee.getJobTitle()));
            Department department = employee.getDepartment();
            dto.setDepartmentName(department != null ? safe(department.getDepartmentName()) : "N/A");
        } else {
            dto.setFirstName("");
            dto.setLastName("");
            dto.setFullName("");
            dto.setDepartmentName("N/A");
            dto.setJobTitle("N/A");
        }

        return dto;
    }

    private LeavesDTO defaultDto(Integer employeeId, Employee employee) {
        return toDto(employeeId, employee, null, List.of());
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private static final class LeaveBalance {
        private int id;
        private int used;
        private int remaining;
    }
}
