package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.CreateNotificationRequest;
import com.hranalytics.hrbackend.dto.NotificationDTO;
import com.hranalytics.hrbackend.security.AuthenticatedUser;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.NotificationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public List<NotificationDTO> getAll() {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        return notificationService.getAll(user.getUserId());
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<Void> markAsRead(@PathVariable Long id) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        notificationService.markAsRead(id, user.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/read-all")
    public ResponseEntity<Void> markAllAsRead() {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        notificationService.markAllAsRead(user.getUserId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<NotificationDTO> create(@RequestBody CreateNotificationRequest request) {
        SecurityUtils.requireAuthenticated();
        NotificationDTO dto = notificationService.createManualNotification(
                request.getType(),
                request.getTitle(),
                request.getMessage(),
                request.getRecipientId(),
                request.getSourceTable(),
                request.getSourceId(),
                request.getTargetUrl(),
                request.getTargetRole()
        );
        return ResponseEntity.ok(dto);
    }
}
