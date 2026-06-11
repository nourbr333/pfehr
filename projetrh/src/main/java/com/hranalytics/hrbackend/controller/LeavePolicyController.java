package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.LeavePolicyDto;
import com.hranalytics.hrbackend.service.LeavePolicyService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/leave-policies")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class LeavePolicyController {

    private final LeavePolicyService leavePolicyService;

    public LeavePolicyController(LeavePolicyService leavePolicyService) {
        this.leavePolicyService = leavePolicyService;
    }

    @GetMapping
    public List<LeavePolicyDto> getAll() {
        return leavePolicyService.getAll();
    }

    @PatchMapping("/{id}")
    public LeavePolicyDto update(@PathVariable Integer id, @RequestBody LeavePolicyDto dto) {
        return leavePolicyService.update(id, dto);
    }
}
