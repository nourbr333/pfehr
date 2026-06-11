package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.EventDTO;
import com.hranalytics.hrbackend.dto.EventUpsertRequestDTO;
import com.hranalytics.hrbackend.security.AuthenticatedUser;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.EventService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/api/events")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EventController {

    private final EventService eventService;

    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    @GetMapping
    public List<EventDTO> getVisibleEvents(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        return eventService.getVisibleEvents(user.getEmployeeId(), user.getRole(), from, to);
    }

    @PostMapping
    public EventDTO create(@Valid @RequestBody EventUpsertRequestDTO payload) {
        SecurityUtils.requireAuthenticated();
        return eventService.createEvent(payload);
    }

    @PutMapping("/{eventId}")
    public EventDTO update(
            @PathVariable Long eventId,
            @Valid @RequestBody EventUpsertRequestDTO payload) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        boolean staffOverride = SecurityUtils.isAdminOrRh(user);
        return eventService.updateEvent(eventId, user.getEmployeeId(), staffOverride, payload);
    }

    @DeleteMapping("/{eventId}")
    public void delete(@PathVariable Long eventId) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        boolean staffOverride = SecurityUtils.isAdminOrRh(user);
        eventService.deleteEvent(eventId, user.getEmployeeId(), staffOverride);
    }
}
