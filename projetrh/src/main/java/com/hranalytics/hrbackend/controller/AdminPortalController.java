package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AdminDashboardStatsDTO;
import com.hranalytics.hrbackend.dto.AdminLogDTO;
import com.hranalytics.hrbackend.dto.AdminManagersOverviewDTO;
import com.hranalytics.hrbackend.dto.AdminPasswordResetRequest;
import com.hranalytics.hrbackend.dto.AdminRhOverviewDTO;
import com.hranalytics.hrbackend.dto.AdminRoleDTO;
import com.hranalytics.hrbackend.dto.AdminRoleUpdateRequest;
import com.hranalytics.hrbackend.dto.AdminUserUpsertRequest;
import com.hranalytics.hrbackend.dto.AdminUserDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.service.AdminOverviewService;
import com.hranalytics.hrbackend.service.AdminPortalService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class AdminPortalController {

    private final AdminPortalService adminPortalService;
    private final AdminOverviewService adminOverviewService;

    public AdminPortalController(AdminPortalService adminPortalService,
                                 AdminOverviewService adminOverviewService) {
        this.adminPortalService = adminPortalService;
        this.adminOverviewService = adminOverviewService;
    }

    @GetMapping("/users")
    public List<AdminUserDTO> getUsers() {
        return adminPortalService.getUsers();
    }

    @GetMapping("/roles")
    public List<AdminRoleDTO> getRoles() {
        return adminPortalService.getRoles();
    }

    @GetMapping("/logs")
    public PageResponse<AdminLogDTO> getLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false, defaultValue = "TOUS") String tab,
            @RequestParam(required = false) String cible,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false, defaultValue = "desc") String sort,
            @RequestParam(defaultValue = "false") boolean unpaged
    ) {
        if (!unpaged && size <= 0) {
            size = 10;
        }
        return adminPortalService.getLogsPage(
                page, size, search, tab, cible, dateFrom, dateTo, sort, unpaged
        );
    }

    @GetMapping("/logs/targets")
    public List<String> getLogTargets() {
        return adminPortalService.getLogTargetNames();
    }

    @GetMapping("/dashboard")
    public AdminDashboardStatsDTO getDashboardStats() {
        return adminPortalService.getDashboardStats();
    }

    /** Récap de l'activité RH (Vue Responsables). */
    @GetMapping("/overview/rh")
    public AdminRhOverviewDTO getRhOverview() {
        return adminOverviewService.getRhOverview();
    }

    /** Récap de l'activité des managers (Vue Managers). */
    @GetMapping("/overview/managers")
    public AdminManagersOverviewDTO getManagersOverview() {
        return adminOverviewService.getManagersOverview();
    }

    @PostMapping("/users")
    public AdminUserDTO addUser(@Valid @RequestBody AdminUserUpsertRequest request) {
        return adminPortalService.addUser(request);
    }

    @PutMapping("/users/{userId}")
    public AdminUserDTO updateUser(@PathVariable Long userId,
                                   @Valid @RequestBody AdminUserUpsertRequest request) {
        return adminPortalService.updateUser(userId, request);
    }

    @DeleteMapping("/users/{userId}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long userId) {
        adminPortalService.deleteUser(userId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/users/{userId}/role")
    public AdminUserDTO assignRole(@PathVariable Long userId,
                                   @Valid @RequestBody AdminRoleUpdateRequest request) {
        return adminPortalService.assignRole(userId, request.role());
    }

    @PutMapping("/users/{userId}/status/toggle")
    public AdminUserDTO toggleStatus(@PathVariable Long userId) {
        return adminPortalService.toggleUserStatus(userId);
    }

    @PutMapping("/users/{userId}/validate")
    public AdminUserDTO validate(@PathVariable Long userId) {
        return adminPortalService.validateAccount(userId);
    }

    @PostMapping("/users/{userId}/reset-password")
    public ResponseEntity<Void> resetPassword(@PathVariable Long userId,
                                              @Valid @RequestBody AdminPasswordResetRequest request) {
        adminPortalService.resetPassword(userId, request.password());
        return ResponseEntity.noContent().build();
    }

    /** Resolve the userId of the active user account linked to a given employee. Returns 204 if none found. */
    @GetMapping("/users/by-employee/{employeeId}")
    public ResponseEntity<Long> getUserIdByEmployee(@PathVariable Long employeeId) {
        return adminPortalService.getUserIdByEmployeeId(employeeId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }
}
