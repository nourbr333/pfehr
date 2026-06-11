package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.EventDTO;
import com.hranalytics.hrbackend.dto.EventUpsertRequestDTO;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.Event;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.EventRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EventService {

    private static final Set<String> ADMIN_OR_RH_ROLE_MARKERS =
            Set.of("admin", "rh", "responsable", "administrateur");

    private final EventRepository eventRepository;
    private final EmployeeRepository employeeRepository;

    public EventService(EventRepository eventRepository, EmployeeRepository employeeRepository) {
        this.eventRepository = eventRepository;
        this.employeeRepository = employeeRepository;
    }

    @Transactional(readOnly = true)
    public List<EventDTO> getVisibleEvents(Integer viewerEmployeeId, String viewerRole, LocalDate from, LocalDate to) {
        LocalDate safeFrom = from == null ? LocalDate.now().withDayOfMonth(1) : from;
        LocalDate safeTo = to == null ? safeFrom.plusMonths(1).minusDays(1) : to;
        List<Event> events =
                eventRepository.findByAnnuleFalseAndEventDateBetweenOrderByEventDateAscEventTimeAscCreatedAtDesc(
                        safeFrom, safeTo);

        boolean adminOrRh = isAdminOrRh(viewerRole);
        Employee viewer = viewerEmployeeId == null ? null : employeeRepository.findById(viewerEmployeeId).orElse(null);

        return events.stream()
                .filter(event -> isVisibleToViewer(event, viewerEmployeeId, viewer, adminOrRh))
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public EventDTO createEvent(EventUpsertRequestDTO payload) {
        Event event = new Event();
        applyEditablePayload(event, payload);
        event.setCreatedByEmployeeId(payload.getCreatedByEmployeeId());
        event.setCreatedByName(cleanOrNull(payload.getCreatedByName()));
        event.setCreatedByRole(cleanOrNull(payload.getCreatedByRole()));
        LocalDateTime now = LocalDateTime.now();
        event.setCreatedAt(now);
        event.setUpdatedAt(now);
        event.setAnnule(Boolean.FALSE);
        return toDto(eventRepository.save(event));
    }

    @Transactional
    public EventDTO updateEvent(Long eventId, Integer actorEmployeeId, boolean staffOverride, EventUpsertRequestDTO payload) {
        @SuppressWarnings("null")
        Event event = eventRepository
                .findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "evenement introuvable"));
        if (Boolean.TRUE.equals(event.getAnnule())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "evenement annule");
        }
        if (!staffOverride) {
            ensureOwner(event, actorEmployeeId);
        }
        applyEditablePayload(event, payload);
        event.setUpdatedAt(LocalDateTime.now());
        return toDto(eventRepository.save(event));
    }

    @Transactional
    public void deleteEvent(Long eventId, Integer actorEmployeeId, boolean staffOverride) {
        @SuppressWarnings("null")
        Event event = eventRepository
                .findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "evenement introuvable"));
        if (!staffOverride) {
            ensureOwner(event, actorEmployeeId);
        }
        if (Boolean.TRUE.equals(event.getAnnule())) {
            return;
        }
        event.setAnnule(Boolean.TRUE);
        event.setUpdatedAt(LocalDateTime.now());
        eventRepository.save(event);
    }

    private void applyEditablePayload(Event event, EventUpsertRequestDTO payload) {
        String targetType = clean(payload.getTargetType()).toLowerCase(Locale.ROOT);
        Set<Integer> targetEmployeeIds = toNormalizedIds(payload.getTargetEmployeeIds());
        if (requiresSpecificEmployees(targetType) && targetEmployeeIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "employes cibles obligatoires");
        }
        if ("rh_department".equals(targetType) && payload.getTargetDepartmentId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "departement cible obligatoire");
        }
        if ("rh_job_title".equals(targetType)
                && (payload.getTargetDepartmentId() == null || clean(payload.getTargetJobTitle()).isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "departement et poste obligatoires");
        }

        event.setTitle(clean(payload.getTitle()));
        event.setDescription(cleanOrNull(payload.getDescription()));
        event.setEventDate(payload.getEventDate());
        event.setEventTime(payload.getEventTime());
        event.setEventType(clean(payload.getEventType()).toLowerCase(Locale.ROOT));
        event.setTargetType(targetType);
        event.setTargetDepartmentId(payload.getTargetDepartmentId());
        event.setTargetJobTitle(cleanOrNull(payload.getTargetJobTitle()));
        event.setTargetEmployeeIds(joinIds(targetEmployeeIds));
    }

    private void ensureOwner(Event event, Integer actorEmployeeId) {
        if (actorEmployeeId == null || !Objects.equals(event.getCreatedByEmployeeId(), actorEmployeeId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "seul le createur peut modifier ou supprimer cet evenement");
        }
    }

    private boolean isVisibleToViewer(Event event, Integer viewerEmployeeId, Employee viewer, boolean adminOrRh) {
        if (adminOrRh) {
            return true;
        }
        if (viewerEmployeeId == null || viewer == null) {
            return false;
        }
        if (Objects.equals(event.getCreatedByEmployeeId(), viewerEmployeeId)) {
            return true;
        }

        String targetType = clean(event.getTargetType()).toLowerCase(Locale.ROOT);
        return switch (targetType) {
            case "manager_team" -> isInManagerTeam(viewer, event.getCreatedByEmployeeId());
            case "manager_specific", "rh_specific" -> parseIds(event.getTargetEmployeeIds()).contains(viewerEmployeeId);
            case "rh_company" -> true;
            case "rh_department" -> matchesDepartment(viewer, event.getTargetDepartmentId());
            case "rh_job_title" -> matchesJobTitle(viewer, event.getTargetDepartmentId(), event.getTargetJobTitle());
            default -> false;
        };
    }

    private boolean isInManagerTeam(Employee viewer, Integer managerId) {
        if (viewer == null || managerId == null) {
            return false;
        }
        return Objects.equals(viewer.getManagerId(), managerId) || Objects.equals(viewer.getEmployeeId(), managerId);
    }

    private boolean matchesDepartment(Employee viewer, Integer targetDepartmentId) {
        if (viewer == null || targetDepartmentId == null) return false;
        Department department = viewer.getDepartment();
        return department != null && Objects.equals(department.getDepartmentId(), targetDepartmentId);
    }

    private boolean matchesJobTitle(Employee viewer, Integer targetDepartmentId, String targetJobTitle) {
        if (!matchesDepartment(viewer, targetDepartmentId)) return false;
        return clean(targetJobTitle).equalsIgnoreCase(clean(viewer.getJobTitle()));
    }

    private boolean isAdminOrRh(String role) {
        String normalized = clean(role).toLowerCase(Locale.ROOT);
        for (String marker : ADMIN_OR_RH_ROLE_MARKERS) {
            if (normalized.contains(marker)) return true;
        }
        return false;
    }

    private EventDTO toDto(Event event) {
        EventDTO dto = new EventDTO();
        dto.setEventId(event.getEventId());
        dto.setTitle(event.getTitle());
        dto.setDescription(event.getDescription());
        dto.setEventDate(event.getEventDate());
        dto.setEventTime(event.getEventTime());
        dto.setEventType(event.getEventType());
        dto.setTargetType(event.getTargetType());
        dto.setTargetDepartmentId(event.getTargetDepartmentId());
        dto.setTargetJobTitle(event.getTargetJobTitle());
        dto.setTargetEmployeeIds(new ArrayList<>(parseIds(event.getTargetEmployeeIds())));
        dto.setCreatedByEmployeeId(event.getCreatedByEmployeeId());
        dto.setCreatedByName(event.getCreatedByName());
        dto.setCreatedByRole(event.getCreatedByRole());
        dto.setAnnule(event.getAnnule());
        dto.setCreatedAt(event.getCreatedAt());
        dto.setUpdatedAt(event.getUpdatedAt());
        return dto;
    }

    private boolean requiresSpecificEmployees(String targetType) {
        return "manager_specific".equals(targetType) || "rh_specific".equals(targetType);
    }

    private Set<Integer> parseIds(String csv) {
        Set<Integer> ids = new LinkedHashSet<>();
        String safe = clean(csv);
        if (safe.isBlank()) return ids;
        String[] parts = safe.split(",");
        for (String part : parts) {
            String value = clean(part);
            if (value.isBlank()) continue;
            try {
                ids.add(Integer.parseInt(value));
            } catch (NumberFormatException ignored) {
                // Ignore malformed ids already persisted.
            }
        }
        return ids;
    }

    private Set<Integer> toNormalizedIds(List<Integer> ids) {
        Set<Integer> normalized = new LinkedHashSet<>();
        if (ids == null) return normalized;
        for (Integer id : ids) {
            if (id != null && id > 0) normalized.add(id);
        }
        return normalized;
    }

    private String joinIds(Set<Integer> ids) {
        if (ids == null || ids.isEmpty()) return null;
        return ids.stream().map(String::valueOf).reduce((left, right) -> left + "," + right).orElse(null);
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String cleanOrNull(String value) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? null : cleaned;
    }
}
