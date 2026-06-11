package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.NotificationDTO;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.entity.Notification;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.repository.NotificationRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.Time;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Generates and persists in-app notifications derived from real database tables.
 * Notifications are targeted per user (recipient_id) — no employee portal in scope.
 * Manager = team manager (employees.manager_id), not department manager.
 */
@Service
public class NotificationService {

    private static final String ROLE_RH = "RESPONSABLE_RH";
    private static final String ROLE_MANAGER = "MANAGER";
    private static final String ROLE_ADMIN = "ADMIN";
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    private final NotificationRepository repository;
    private final JdbcTemplate jdbc;
    private final AppUserRepository appUserRepository;

    public NotificationService(NotificationRepository repository, JdbcTemplate jdbc, AppUserRepository appUserRepository) {
        this.repository = repository;
        this.jdbc = jdbc;
        this.appUserRepository = appUserRepository;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────────────────

    @Transactional
    public List<NotificationDTO> getAll(Long userId) {
        if (userId == null) {
            return List.of();
        }
        purgeLegacyBroadcastNotifications();
        syncFromRealData();
        return repository.findForUser(userId).stream().map(this::toDTO).toList();
    }

    @Transactional
    public void markAsRead(Long id, Long userId) {
        if (userId == null || id == null) return;
        repository.markAsReadForUser(id, userId);
    }

    @Transactional
    public void markAllAsRead(Long userId) {
        if (userId == null) return;
        repository.markAllAsReadForUser(userId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sync
    // ──────────────────────────────────────────────────────────────────────────

    private void syncFromRealData() {
        syncPendingLeaveRequests();
        syncRecentlyResolvedLeaveRequests();
        syncExpiredLeaveRequests();
        syncNewEmployees();
        syncUpcomingEvents();
        syncHighAbsenteeismDepartments();
        backfillLeaveTargetUrls();
    }

    /** Ensures navigation URLs on existing leave-related rows (e.g. after migration). */
    private void backfillLeaveTargetUrls() {
        jdbc.update(
                "UPDATE notifications n SET target_url = '/manager/absences-avancees' " +
                "FROM users u WHERE n.recipient_id = u.user_id AND u.role = '" + ROLE_MANAGER + "' " +
                "AND n.source_table = 'leave_requests' " +
                "AND n.type IN ('validation','conge','absence','expired') " +
                "AND (n.target_url IS NULL OR TRIM(n.target_url) = '')");
        jdbc.update(
                "UPDATE notifications n SET target_url = '/absences-conges' " +
                "FROM users u WHERE n.recipient_id = u.user_id AND u.role IN ('" + ROLE_RH + "','" + ROLE_ADMIN + "') " +
                "AND n.source_table = 'leave_requests' " +
                "AND n.type IN ('validation','conge','absence','expired') " +
                "AND (n.target_url IS NULL OR TRIM(n.target_url) = '')");
    }

    /** Removes broadcast rows (shared read state) superseded by per-user targeting. */
    private void purgeLegacyBroadcastNotifications() {
        jdbc.update("DELETE FROM notifications WHERE recipient_id IS NULL AND type <> 'relance_eval'");
    }

    /**
     * Pending leave requests: team managers see their team's count; RH/Admin see global count.
     */
    private void syncPendingLeaveRequests() {
        Set<Long> activeRecipients = new HashSet<>();

        List<Object[]> managerRows = jdbc.query(
                "SELECT e.manager_id, COUNT(*) AS cnt " +
                "FROM leave_requests lr " +
                "JOIN employees e ON e.employee_id = lr.employee_id " +
                "WHERE lr.status = 'pending' AND e.manager_id IS NOT NULL " +
                "GROUP BY e.manager_id",
                (rs, rowNum) -> new Object[]{rs.getLong("manager_id"), rs.getInt("cnt")});

        for (Object[] row : managerRows) {
            long managerEmployeeId = (Long) row[0];
            int count = (Integer) row[1];
            Long managerUserId = userIdForEmployee(managerEmployeeId);
            if (managerUserId == null) continue;

            String title = "Validation manager requise";
            String message = count == 1
                    ? "1 demande de congé de votre équipe en attente de votre approbation."
                    : count + " demandes de congé de votre équipe en attente de votre approbation.";

            upsertTargeted("validation", title, message, "leave_requests", 0L,
                    managerUserId, OffsetDateTime.now(), "/manager/absences-avancees");
            activeRecipients.add(managerUserId);
        }

        Integer totalPending = jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'", Integer.class);
        if (totalPending != null && totalPending > 0) {
            String title = "Validation manager requise";
            String message = totalPending == 1
                    ? "1 demande de congé en attente de validation."
                    : totalPending + " demandes de congé en attente de validation.";
            for (Long rhUserId : rhAndAdminUserIds()) {
                upsertTargeted("validation", title, message, "leave_requests", 0L,
                        rhUserId, OffsetDateTime.now(), "/absences-conges");
                activeRecipients.add(rhUserId);
            }
        }

        deleteStaleTargeted("validation", "leave_requests", 0L, activeRecipients);
    }

    /**
     * Approved/rejected leave in last 7 days: notify team manager + RH/Admin (not the employee).
     */
    private void syncRecentlyResolvedLeaveRequests() {
        List<Object[]> rows = jdbc.query(
                "SELECT lr.id, lr.status, lr.reviewed_at, e.manager_id, " +
                "CONCAT(e.first_name, ' ', e.last_name) AS employee_name, " +
                "lr.start_date, lr.end_date " +
                "FROM leave_requests lr " +
                "LEFT JOIN employees e ON e.employee_id = lr.employee_id " +
                "WHERE lr.status IN ('approved','rejected') " +
                "  AND lr.reviewed_at >= NOW() - INTERVAL '7 days' " +
                "ORDER BY lr.reviewed_at DESC",
                (rs, rowNum) -> new Object[]{
                        rs.getLong("id"),
                        rs.getString("status"),
                        rs.getObject("reviewed_at", OffsetDateTime.class),
                        rs.getObject("manager_id") != null ? rs.getLong("manager_id") : null,
                        rs.getString("employee_name"),
                        rs.getDate("start_date"),
                        rs.getDate("end_date")
                });

        Set<String> activeKeys = new HashSet<>();

        for (Object[] row : rows) {
            long requestId = (Long) row[0];
            String status = (String) row[1];
            OffsetDateTime at = (OffsetDateTime) row[2];
            Long managerEmployeeId = (Long) row[3];
            String name = row[4] != null ? (String) row[4] : "Employé inconnu";
            String start = formatDate((Date) row[5]);
            String end = formatDate((Date) row[6]);

            String type = "approved".equals(status) ? "conge" : "absence";
            String title = "approved".equals(status)
                    ? "Demande de congé approuvée"
                    : "Demande de congé refusée";
            String message = "approved".equals(status)
                    ? "La demande de " + name + " du " + start + " au " + end + " a été approuvée."
                    : "La demande de " + name + " du " + start + " au " + end + " a été refusée.";

            Long managerUserId = userIdForEmployee(managerEmployeeId);
            if (managerUserId != null) {
                upsertTargeted(type, title, message, "leave_requests", requestId,
                        managerUserId, at, "/manager/absences-avancees");
                activeKeys.add(type + ":" + requestId + ":" + managerUserId);
            }

            for (Long rhUserId : rhAndAdminUserIds()) {
                upsertTargeted(type, title, message, "leave_requests", requestId,
                        rhUserId, at, "/absences-conges");
                activeKeys.add(type + ":" + requestId + ":" + rhUserId);
            }
        }

        pruneResolvedLeaveNotifications(activeKeys);
    }

    /**
     * Expired leave requests (24h): team managers see their team's count; RH/Admin see global count.
     */
    private void syncExpiredLeaveRequests() {
        Set<Long> activeRecipients = new HashSet<>();

        List<Object[]> managerRows = jdbc.query(
                "SELECT e.manager_id, COUNT(*) AS cnt " +
                "FROM leave_requests lr " +
                "JOIN employees e ON e.employee_id = lr.employee_id " +
                "WHERE lr.status = 'expired' " +
                "  AND lr.reviewed_at >= NOW() - INTERVAL '24 hours' " +
                "  AND e.manager_id IS NOT NULL " +
                "GROUP BY e.manager_id",
                (rs, rowNum) -> new Object[]{rs.getLong("manager_id"), rs.getInt("cnt")});

        for (Object[] row : managerRows) {
            long managerEmployeeId = (Long) row[0];
            int count = (Integer) row[1];
            Long managerUserId = userIdForEmployee(managerEmployeeId);
            if (managerUserId == null) continue;

            String title = "Demandes arrivées à échéance";
            String message = count == 1
                    ? "1 demande de congé de votre équipe est arrivée à échéance sans réponse."
                    : count + " demandes de congé de votre équipe sont arrivées à échéance sans réponse.";

            upsertTargeted("expired", title, message, "leave_requests", 0L,
                    managerUserId, OffsetDateTime.now(), "/manager/absences-avancees");
            activeRecipients.add(managerUserId);
        }

        Integer totalExpired = jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_requests WHERE status = 'expired' " +
                "AND reviewed_at >= NOW() - INTERVAL '24 hours'",
                Integer.class);
        if (totalExpired != null && totalExpired > 0) {
            String title = "Demandes arrivées à échéance";
            String message = totalExpired == 1
                    ? "1 demande de congé est arrivée à échéance sans réponse."
                    : totalExpired + " demandes de congé sont arrivées à échéance sans réponse.";
            for (Long rhUserId : rhAndAdminUserIds()) {
                upsertTargeted("expired", title, message, "leave_requests", 0L,
                        rhUserId, OffsetDateTime.now(), "/absences-conges");
                activeRecipients.add(rhUserId);
            }
        }

        deleteStaleTargeted("expired", "leave_requests", 0L, activeRecipients);
    }

    /** New hires (30 days): RH and Admin only. */
    private void syncNewEmployees() {
        List<Object[]> rows = jdbc.query(
                "SELECT e.employee_id, " +
                "CONCAT(e.first_name, ' ', e.last_name) AS full_name, " +
                "d.department_name, e.job_title, e.hire_date " +
                "FROM employees e " +
                "LEFT JOIN departments d ON d.department_id = e.department_id " +
                "WHERE e.hire_date >= CURRENT_DATE - INTERVAL '30 days' " +
                "ORDER BY e.hire_date DESC",
                (rs, rowNum) -> new Object[]{
                        rs.getLong("employee_id"),
                        rs.getString("full_name"),
                        rs.getString("department_name"),
                        rs.getString("job_title"),
                        rs.getDate("hire_date")
                });

        Set<String> activeKeys = new HashSet<>();
        List<Long> rhUsers = rhAndAdminUserIds();

        for (Object[] row : rows) {
            long empId = (Long) row[0];
            String name = row[1] != null ? (String) row[1] : "Nouvel employé";
            String dept = row[2] != null ? (String) row[2] : "département inconnu";
            String job = row[3] != null ? (String) row[3] : "";
            String hired = formatDate((Date) row[4]);

            String title = "Nouvel employé ajouté";
            String message = name + (job.isEmpty() ? "" : " (" + job + ")") +
                    " a rejoint le département " + dept + " le " + hired + ".";

            OffsetDateTime ts = OffsetDateTime.now().minusDays(
                    java.time.temporal.ChronoUnit.DAYS.between(
                            row[4] != null ? ((java.sql.Date) row[4]).toLocalDate() : java.time.LocalDate.now(),
                            java.time.LocalDate.now()));

            String targetUrl = "/employes?employeeId=" + empId;
            for (Long rhUserId : rhUsers) {
                upsertTargeted("employe_embauche", title, message, "employees", empId,
                        rhUserId, ts, targetUrl);
                activeKeys.add(empId + ":" + rhUserId);
            }
        }

        pruneEmployeeHireNotifications(activeKeys);
    }

    /** Upcoming events (7 days): all portal roles (Admin, RH, Manager). */
    private void syncUpcomingEvents() {
        List<Object[]> rows = jdbc.query(
                "SELECT event_id, title, event_date, event_time, event_type " +
                "FROM events " +
                "WHERE annule = false " +
                "  AND event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' " +
                "ORDER BY event_date ASC",
                (rs, rowNum) -> new Object[]{
                        rs.getLong("event_id"),
                        rs.getString("title"),
                        rs.getDate("event_date"),
                        rs.getTime("event_time"),
                        rs.getString("event_type")
                });

        Set<String> activeKeys = new HashSet<>();

        for (Object[] row : rows) {
            long eventId = (Long) row[0];
            String evtTitle = row[1] != null ? (String) row[1] : "Événement";
            String evtDate = formatDate((Date) row[2]);
            String evtTime = formatTime((Time) row[3]);

            String notifTitle = "Événement à venir";
            String notifMessage = buildEventMessage(evtTitle, evtDate, evtTime);

            for (AppUser user : portalUsers()) {
                String targetUrl = ROLE_MANAGER.equals(user.getRole())
                        ? "/manager/calendrier"
                        : "/calendrier";
                upsertTargeted("reunion", notifTitle, notifMessage, "events", eventId,
                        user.getUserId(), OffsetDateTime.now(), targetUrl);
                activeKeys.add(eventId + ":" + user.getUserId());
            }
        }

        pruneEventNotifications(activeKeys);
    }

    /** High absenteeism by department: RH and Admin only (no department manager role). */
    private void syncHighAbsenteeismDepartments() {
        List<Object[]> rows = jdbc.query(
                "SELECT d.department_id, d.department_name, " +
                "ROUND((COUNT(*) FILTER (WHERE a.is_present = true) * 100.0 / NULLIF(COUNT(*), 0))::numeric, 1) AS avg_rate " +
                "FROM attendance a " +
                "JOIN employees e ON e.employee_id = a.employee_id " +
                "JOIN departments d ON d.department_id = e.department_id " +
                "GROUP BY d.department_id, d.department_name " +
                "HAVING COUNT(*) FILTER (WHERE a.is_present = true) * 100.0 / NULLIF(COUNT(*), 0) < 85 " +
                "ORDER BY avg_rate ASC",
                (rs, rowNum) -> new Object[]{
                        rs.getLong("department_id"),
                        rs.getString("department_name"),
                        rs.getDouble("avg_rate")
                });

        Set<String> activeKeys = new HashSet<>();
        List<Long> rhUsers = rhAndAdminUserIds();

        for (Object[] row : rows) {
            long deptId = (Long) row[0];
            String deptName = row[1] != null ? (String) row[1] : "Département inconnu";
            double rate = (Double) row[2];

            String title = "Taux d'absentéisme élevé";
            String message = "Le département " + deptName +
                    " affiche un taux de présence moyen de " + rate + " %.";

            for (Long rhUserId : rhUsers) {
                upsertTargeted("avertissement", title, message, "attendance_dept", deptId,
                        rhUserId, OffsetDateTime.now(), "/absences-conges");
                activeKeys.add(deptId + ":" + rhUserId);
            }
        }

        pruneAbsenteeismNotifications(activeKeys);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Manual creation & KPI
    // ──────────────────────────────────────────────────────────────────────────

    @Transactional
    public NotificationDTO createManualNotification(String type, String title, String message,
                                                     Long recipientId, String sourceTable,
                                                     Long sourceId, String targetUrl,
                                                     String targetRole) {
        if (targetRole != null && !targetRole.isBlank()) {
            List<AppUser> targets = appUserRepository.findByRoleAndIsActiveTrue(targetRole);
            NotificationDTO last = null;
            for (AppUser user : targets) {
                last = insertAndReturn(type, title, message, user.getUserId(),
                        sourceTable, sourceId, targetUrl);
            }
            if (last != null) return last;
            throw new IllegalStateException("Aucun utilisateur actif pour le rôle " + targetRole);
        }
        if (recipientId == null) {
            throw new IllegalArgumentException("recipientId requis lorsque targetRole est absent");
        }
        return insertAndReturn(type, title, message, recipientId, sourceTable, sourceId, targetUrl);
    }

    private NotificationDTO insertAndReturn(String type, String title, String message,
                                             Long recipientId, String sourceTable,
                                             Long sourceId, String targetUrl) {
        jdbc.update(
                "INSERT INTO notifications (type, title, message, created_at, is_read, source_table, source_id, recipient_id, target_url) " +
                "VALUES (?, ?, ?, ?, false, ?, ?, ?, ?)",
                type, title, message, OffsetDateTime.now(),
                sourceTable, sourceId, recipientId, targetUrl);
        @SuppressWarnings("null")
        Long newId = jdbc.queryForObject(
                "SELECT id FROM notifications WHERE source_table = ? AND source_id = ? AND type = ? AND recipient_id IS NOT DISTINCT FROM ? " +
                "ORDER BY created_at DESC LIMIT 1",
                Long.class, sourceTable, sourceId, type, recipientId);
        if (newId == null) throw new RuntimeException("Failed to retrieve created notification id");
        Notification n = repository.findById(newId)
                .orElseThrow(() -> new RuntimeException("Notification not found after insert"));
        return toDTO(n);
    }

    @Transactional
    public void upsertKpiThresholdNotification(Long recipientId, String type, String title,
                                               String message, Long thresholdId, String targetUrl) {
        upsertTargeted(type, title, message, "kpi_thresholds", thresholdId, recipientId,
                OffsetDateTime.now(), targetUrl, true);
    }

    @Transactional
    public void clearKpiThresholdNotifications(Long recipientId, Long thresholdId) {
        jdbc.update(
                "DELETE FROM notifications WHERE source_table = 'kpi_thresholds' AND source_id = ? " +
                "AND recipient_id = ? AND type IN ('avertissement', 'performance')",
                thresholdId, recipientId);
    }

    @Transactional
    public void clearKpiThresholdNotification(Long recipientId, Long thresholdId, String type) {
        jdbc.update(
                "DELETE FROM notifications WHERE source_table = 'kpi_thresholds' AND source_id = ? " +
                "AND recipient_id = ? AND type = ?",
                thresholdId, recipientId, type);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private List<Long> rhAndAdminUserIds() {
        return appUserRepository.findByRoleInAndIsActiveTrue(List.of(ROLE_RH, ROLE_ADMIN)).stream()
                .map(AppUser::getUserId)
                .collect(Collectors.toList());
    }

    private List<AppUser> portalUsers() {
        return new ArrayList<>(
                appUserRepository.findByRoleInAndIsActiveTrue(List.of(ROLE_ADMIN, ROLE_RH, ROLE_MANAGER)));
    }

    private Long userIdForEmployee(Long employeeId) {
        if (employeeId == null) return null;
        return appUserRepository.findByEmployee_EmployeeIdAndIsActiveTrue(employeeId)
                .map(AppUser::getUserId)
                .orElseGet(() -> jdbc.query(
                        "SELECT user_id FROM users WHERE employee_id = ? AND is_active = true LIMIT 1",
                        rs -> rs.next() ? rs.getLong("user_id") : null,
                        employeeId.intValue()));
    }

    private void upsertTargeted(String type, String title, String message,
                                String sourceTable, Long sourceId, Long recipientId,
                                OffsetDateTime createdAt, String targetUrl) {
        upsertTargeted(type, title, message, sourceTable, sourceId, recipientId, createdAt, targetUrl, false);
    }

    /**
     * Update-then-insert upsert (compatible with partial unique indexes on all PostgreSQL versions).
     */
    private void upsertTargeted(String type, String title, String message,
                                String sourceTable, Long sourceId, Long recipientId,
                                OffsetDateTime createdAt, String targetUrl,
                                boolean resetReadOnUpdate) {
        if (recipientId == null) return;

        int updated = jdbc.update(
                "UPDATE notifications SET title = ?, message = ?, target_url = ?, created_at = ?" +
                (resetReadOnUpdate ? ", is_read = false" : "") +
                " WHERE source_table = ? AND source_id = ? AND type = ? AND recipient_id = ?",
                title, message, targetUrl, createdAt,
                sourceTable, sourceId, type, recipientId);

        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO notifications (type, title, message, created_at, is_read, source_table, source_id, recipient_id, target_url) " +
                    "VALUES (?, ?, ?, ?, false, ?, ?, ?, ?)",
                    type, title, message, createdAt, sourceTable, sourceId, recipientId, targetUrl);
        }
    }

    private String formatDate(Date date) {
        if (date == null) return "?";
        return formatDate(date.toLocalDate());
    }

    private String formatDate(LocalDate date) {
        if (date == null) return "?";
        return date.format(DATE_FMT);
    }

    private String formatTime(Time time) {
        if (time == null) return "";
        return time.toLocalTime().format(TIME_FMT);
    }

    private String buildEventMessage(String title, String date, String time) {
        if (date == null || date.isBlank() || "?".equals(date)) {
            return title;
        }
        if (time != null && !time.isBlank()) {
            return title + " — le " + date + " à " + time;
        }
        return title + " — le " + date;
    }

    private void deleteStaleTargeted(String type, String sourceTable, Long sourceId, Set<Long> activeRecipients) {
        if (activeRecipients.isEmpty()) {
            jdbc.update(
                    "DELETE FROM notifications WHERE type = ? AND source_table = ? AND source_id = ? AND recipient_id IS NOT NULL",
                    type, sourceTable, sourceId);
            return;
        }
        String placeholders = activeRecipients.stream().map(id -> "?").collect(Collectors.joining(","));
        List<Object> params = new ArrayList<>();
        params.add(type);
        params.add(sourceTable);
        params.add(sourceId);
        params.addAll(activeRecipients);
        jdbc.update(
                "DELETE FROM notifications WHERE type = ? AND source_table = ? AND source_id = ? " +
                "AND recipient_id IS NOT NULL AND recipient_id NOT IN (" + placeholders + ")",
                params.toArray());
    }

    private void pruneResolvedLeaveNotifications(Set<String> activeKeys) {
        jdbc.update(
                "DELETE FROM notifications n WHERE n.type IN ('conge','absence') " +
                "AND n.source_table = 'leave_requests' AND n.recipient_id IS NOT NULL " +
                "AND NOT EXISTS (" +
                "  SELECT 1 FROM leave_requests lr WHERE lr.id = n.source_id " +
                "  AND lr.status IN ('approved','rejected') " +
                "  AND lr.reviewed_at >= NOW() - INTERVAL '7 days')");
    }

    private void pruneEmployeeHireNotifications(Set<String> activeKeys) {
        jdbc.update(
                "DELETE FROM notifications n WHERE n.type = 'employe_embauche' " +
                "AND n.source_table = 'employees' AND n.recipient_id IS NOT NULL " +
                "AND NOT EXISTS (" +
                "  SELECT 1 FROM employees e WHERE e.employee_id = n.source_id " +
                "  AND e.hire_date >= CURRENT_DATE - INTERVAL '30 days')");
    }

    private void pruneEventNotifications(Set<String> activeKeys) {
        jdbc.update(
                "DELETE FROM notifications n WHERE n.type = 'reunion' AND n.source_table = 'events' " +
                "AND n.recipient_id IS NOT NULL AND NOT EXISTS (" +
                "  SELECT 1 FROM events ev WHERE ev.event_id = n.source_id " +
                "  AND ev.annule = false " +
                "  AND ev.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days')");
    }

    private void pruneAbsenteeismNotifications(Set<String> activeKeys) {
        jdbc.update(
                "DELETE FROM notifications n WHERE n.type = 'avertissement' " +
                "AND n.source_table = 'attendance_dept' AND n.recipient_id IS NOT NULL " +
                "AND NOT EXISTS (" +
                "  SELECT 1 FROM (" +
                "    SELECT d.department_id " +
                "    FROM attendance a " +
                "    JOIN employees e ON e.employee_id = a.employee_id " +
                "    JOIN departments d ON d.department_id = e.department_id " +
                "    GROUP BY d.department_id " +
                "    HAVING COUNT(*) FILTER (WHERE a.is_present = true) * 100.0 / NULLIF(COUNT(*), 0) < 85" +
                "  ) bad WHERE bad.department_id = n.source_id)");
    }

    private NotificationDTO toDTO(Notification n) {
        NotificationDTO dto = new NotificationDTO();
        dto.setId(n.getId());
        dto.setType(n.getType());
        dto.setTitle(n.getTitle());
        dto.setMessage(n.getMessage());
        dto.setCreatedAt(n.getCreatedAt());
        dto.setRead(Boolean.TRUE.equals(n.getIsRead()));
        dto.setRecipientId(n.getRecipientId());
        dto.setTargetUrl(n.getTargetUrl());
        return dto;
    }
}
