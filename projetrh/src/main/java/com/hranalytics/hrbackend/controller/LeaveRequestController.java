package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.*;
import com.hranalytics.hrbackend.service.LeaveRequestService;
import com.hranalytics.hrbackend.util.PaginationSupport;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/leave-requests")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class LeaveRequestController {

    private final LeaveRequestService leaveRequestService;

    public LeaveRequestController(LeaveRequestService leaveRequestService) {
        this.leaveRequestService = leaveRequestService;
    }

    @GetMapping
    public PageResponse<LeaveRequestDto> getAll(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer employeeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean unpaged
    ) {
        if (!unpaged && size <= 0) {
            size = PaginationSupport.DEFAULT_SIZE;
        }
        return leaveRequestService.getPage(status, employeeId, page, size, unpaged);
    }

    @GetMapping("/{id}")
    public LeaveRequestDto getById(@PathVariable Integer id) {
        return leaveRequestService.getById(id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public LeaveRequestDto create(@RequestBody CreateLeaveRequestDto dto) {
        return leaveRequestService.create(dto);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public LeaveRequestDto updateStatus(@PathVariable Integer id, @RequestBody UpdateLeaveRequestStatusDto dto) {
        return leaveRequestService.updateStatus(id, dto);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public ResponseEntity<Void> delete(@PathVariable Integer id) {
        leaveRequestService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/kpis/ongoing-this-month")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public int getOngoingThisMonth() {
        return leaveRequestService.countOngoingThisMonth();
    }

    @GetMapping("/kpis/pending-count")
    @PreAuthorize("hasAnyRole('ADMIN', 'RESPONSABLE_RH')")
    public int getPendingCount() {
        return leaveRequestService.countPending();
    }

    @GetMapping("/conflicts")
    public List<LeaveConflictDto> detectConflicts(
            @RequestParam Integer employeeId,
            @RequestParam String startDate,
            @RequestParam String endDate) {
        return leaveRequestService.detectConflicts(employeeId, startDate, endDate);
    }
}
