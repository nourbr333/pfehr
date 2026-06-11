package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AttendanceDTO;
import com.hranalytics.hrbackend.dto.AttendanceImportSummaryDTO;
import com.hranalytics.hrbackend.dto.AttendanceManualUpdateRequest;
import com.hranalytics.hrbackend.dto.AttendancePendingRowDTO;
import com.hranalytics.hrbackend.dto.AttendancePreviewResultDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.service.AttendanceService;
import com.hranalytics.hrbackend.util.PaginationSupport;
import jakarta.validation.Valid;
import java.util.List;
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
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/hr/attendance")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class HrAttendanceController {

    private final AttendanceService attendanceService;

    public HrAttendanceController(AttendanceService attendanceService) {
        this.attendanceService = attendanceService;
    }

    @GetMapping
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

    @GetMapping("/{employeeId}")
    public AttendanceDTO getByEmployeeId(@PathVariable Integer employeeId) {
        return attendanceService.findByEmployeeIdOrDefault(employeeId);
    }

    @PutMapping("/{employeeId}")
    public AttendanceDTO upsertByEmployeeId(
            @PathVariable Integer employeeId,
            @Valid @RequestBody AttendanceManualUpdateRequest request
    ) {
        return attendanceService.upsertManual(employeeId, request);
    }

    @DeleteMapping("/{employeeId}")
    public void deleteByEmployeeId(@PathVariable Integer employeeId) {
        attendanceService.deleteByEmployeeId(employeeId);
    }

    @DeleteMapping("/{employeeId}/{startDate}/{endDate}")
    public void deleteByEmployeeIdAndPeriod(
            @PathVariable Integer employeeId,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        attendanceService.deleteByEmployeeIdAndPeriod(employeeId, startDate, endDate);
    }

    @PostMapping("/import-excel")
    public AttendanceImportSummaryDTO importExcel(@RequestParam("file") MultipartFile file) {
        return attendanceService.importExcel(file);
    }

    @PostMapping("/preview-excel")
    public AttendancePreviewResultDTO previewExcel(@RequestParam("file") MultipartFile file) {
        return attendanceService.previewExcel(file);
    }

    @PostMapping("/commit")
    public AttendanceImportSummaryDTO commitPendingRows(@RequestBody List<AttendancePendingRowDTO> rows) {
        return attendanceService.commitPendingRows(rows);
    }
}
