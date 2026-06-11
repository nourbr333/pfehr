package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AttendanceDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.service.AttendanceService;
import com.hranalytics.hrbackend.util.PaginationSupport;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EmployeeAttendanceController {

    private final AttendanceService attendanceService;

    public EmployeeAttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping("/attendance")
    public PageResponse<AttendanceDTO> listAttendance(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean unpaged
    ) {
        if (!unpaged && size <= 0) {
            size = PaginationSupport.DEFAULT_SIZE;
        }
        return attendanceService.findAllPage(page, size, unpaged);
    }

    @GetMapping("/{employeeId}/attendance")
    public AttendanceDTO getEmployeeAttendance(@PathVariable Integer employeeId) {
        return attendanceService.findByEmployeeIdOrDefault(employeeId);
    }
}
