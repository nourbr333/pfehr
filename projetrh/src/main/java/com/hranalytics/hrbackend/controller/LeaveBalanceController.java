package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AdjustLeaveBalanceDto;
import com.hranalytics.hrbackend.dto.LeaveBalanceDto;
import com.hranalytics.hrbackend.service.LeaveBalanceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/leave-balances")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class LeaveBalanceController {

    private final LeaveBalanceService leaveBalanceService;

    public LeaveBalanceController(LeaveBalanceService leaveBalanceService) {
        this.leaveBalanceService = leaveBalanceService;
    }

    @GetMapping
    public List<LeaveBalanceDto> getAll(@RequestParam(required = false) Integer year) {
        return leaveBalanceService.getAll(year);
    }

    @GetMapping("/{employeeId}")
    public List<LeaveBalanceDto> getByEmployee(
            @PathVariable Integer employeeId,
            @RequestParam(required = false) Integer year) {
        return leaveBalanceService.getByEmployee(employeeId, year);
    }

    @PatchMapping("/{id}/adjust")
    public LeaveBalanceDto adjust(@PathVariable Integer id, @RequestBody AdjustLeaveBalanceDto dto) {
        return leaveBalanceService.adjust(id, dto);
    }

    @PostMapping("/recompute")
    public List<LeaveBalanceDto> recompute(@RequestBody Map<String, Integer> body) {
        Integer employeeId = body.get("employeeId");
        Integer year = body.get("year");
        return leaveBalanceService.recompute(employeeId, year);
    }
}
