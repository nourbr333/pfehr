package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.EvaluationReminderDTO;
import com.hranalytics.hrbackend.entity.Notification;
import com.hranalytics.hrbackend.repository.NotificationRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class EvaluationReminderService {

    private static final int OVERDUE_DAYS = 90;
    private static final String STATUS_TRAITE = "Traité";
    private static final String STATUS_NON_TRAITE = "Non traité";

    private final NotificationRepository notificationRepository;
    private final JdbcTemplate jdbc;

    public EvaluationReminderService(NotificationRepository notificationRepository, JdbcTemplate jdbc) {
        this.notificationRepository = notificationRepository;
        this.jdbc = jdbc;
    }

    /**
     * Creates a relance_eval notification for the given employee's manager.
     * Employee must be overdue (>90 days without evaluation or never evaluated)
     * and must not already have a pending (non-traité) reminder.
     */
    @Transactional
    public EvaluationReminderDTO sendReminder(Integer employeeId) {
        if (isManager(employeeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Les managers ne sont pas concernés par les cycles d'évaluation.");
        }
        if (!isEmployeeOverdue(employeeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cet employé n'a pas de cycle d'évaluation en retard (>90 jours).");
        }
        if (hasPendingReminder(employeeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Une relance est déjà en cours pour cet employé (en attente de traitement par le manager).");
        }

        String sql = """
                SELECT
                    CONCAT(e.first_name, ' ', e.last_name)                          AS employee_name,
                    COALESCE(CONCAT(m.first_name, ' ', m.last_name), 'Non assigné') AS manager_name,
                    e.manager_id                                                     AS manager_employee_id
                FROM employees e
                LEFT JOIN employees m ON m.employee_id = e.manager_id
                WHERE e.employee_id = ?
                """;

        var rows = jdbc.queryForList(sql, employeeId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Employé introuvable.");
        }

        var row = rows.get(0);
        String employeeName = (String) row.get("employee_name");
        String managerName = (String) row.get("manager_name");
        Object managerEmployeeId = row.get("manager_employee_id");

        if (managerEmployeeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cet employé n'a pas de manager assigné — relance impossible.");
        }

        Long managerUserId = jdbc.query(
                "SELECT u.user_id FROM users u WHERE u.employee_id = ? LIMIT 1",
                (rs) -> rs.next() ? rs.getLong("user_id") : null,
                ((Number) managerEmployeeId).intValue()
        );

        if (managerUserId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Le manager n'a pas de compte utilisateur lié — relance impossible.");
        }

        Notification notif = new Notification();
        notif.setType("relance_eval");
        notif.setTitle("Relance évaluation — " + employeeName);
        notif.setMessage("Le cycle d'évaluation de " + employeeName + " est en retard (>90 jours). Merci de planifier une évaluation.");
        notif.setCreatedAt(OffsetDateTime.now());
        notif.setIsRead(false);
        notif.setSourceTable("employees");
        notif.setSourceId(employeeId.longValue());
        notif.setRecipientId(managerUserId);
        notif.setTargetUrl("/manager/evaluations");

        Notification saved = notificationRepository.save(notif);

        EvaluationReminderDTO dto = new EvaluationReminderDTO();
        dto.setNotificationId(saved.getId());
        dto.setEmployeeId(employeeId);
        dto.setEmployeeName(employeeName);
        dto.setManagerName(managerName);
        dto.setSentAt(saved.getCreatedAt());
        dto.setStatus(STATUS_NON_TRAITE);
        return dto;
    }

    /**
     * Returns all relance_eval notifications as reminder history, newest first,
     * with status computed from post-reminder evaluations.
     */
    @Transactional(readOnly = true)
    public List<EvaluationReminderDTO> getHistory() {
        String sql = """
                SELECT
                    n.id            AS notification_id,
                    n.source_id     AS employee_id,
                    n.created_at    AS sent_at,
                    CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                    COALESCE(CONCAT(m.first_name, ' ', m.last_name), 'Non assigné') AS manager_name,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM employee_evaluations ee
                            WHERE ee.employee_id = CAST(n.source_id AS INTEGER)
                              AND ee.evaluated_at >= CAST(n.created_at AS DATE)
                        ) THEN ?
                        ELSE ?
                    END AS status
                FROM notifications n
                LEFT JOIN employees e ON e.employee_id = CAST(n.source_id AS INTEGER)
                LEFT JOIN employees m ON m.employee_id = e.manager_id
                WHERE n.type = 'relance_eval'
                ORDER BY n.created_at DESC
                """;

        return jdbc.query(sql, (rs, rowNum) -> {
            EvaluationReminderDTO dto = new EvaluationReminderDTO();
            dto.setNotificationId(rs.getLong("notification_id"));
            Object srcId = rs.getObject("employee_id");
            dto.setEmployeeId(srcId != null ? ((Number) srcId).intValue() : null);
            dto.setEmployeeName(rs.getString("employee_name"));
            dto.setManagerName(rs.getString("manager_name"));
            dto.setSentAt(rs.getObject("sent_at", OffsetDateTime.class));
            dto.setStatus(rs.getString("status"));
            return dto;
        }, STATUS_TRAITE, STATUS_NON_TRAITE);
    }

    /**
     * Employee IDs that currently have a pending (non-traité) reminder.
     */
    @Transactional(readOnly = true)
    public List<Integer> getPendingReminderEmployeeIds() {
        String sql = """
                SELECT DISTINCT CAST(n.source_id AS INTEGER) AS employee_id
                FROM notifications n
                WHERE n.type = 'relance_eval'
                  AND NOT EXISTS (
                      SELECT 1 FROM employee_evaluations ee
                      WHERE ee.employee_id = CAST(n.source_id AS INTEGER)
                        AND ee.evaluated_at >= CAST(n.created_at AS DATE)
                  )
                """;
        return jdbc.query(sql, (rs, rowNum) -> rs.getInt("employee_id"));
    }

    private boolean isManager(Integer employeeId) {
        Boolean flag = jdbc.query(
                "SELECT is_manager FROM employees WHERE employee_id = ?",
                rs -> rs.next() ? rs.getBoolean("is_manager") : null,
                employeeId
        );
        return Boolean.TRUE.equals(flag);
    }

    private boolean isEmployeeOverdue(Integer employeeId) {
        if (isManager(employeeId)) {
            return false;
        }
        LocalDate threshold = LocalDate.now().minusDays(OVERDUE_DAYS);
        LocalDate lastEval = jdbc.query(
                "SELECT MAX(evaluated_at) FROM employee_evaluations WHERE employee_id = ?",
                (rs) -> rs.next() ? rs.getObject(1, LocalDate.class) : null,
                employeeId
        );
        if (lastEval == null) {
            return true;
        }
        return lastEval.isBefore(threshold);
    }

    private boolean hasPendingReminder(Integer employeeId) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM notifications n
                WHERE n.type = 'relance_eval'
                  AND n.source_id = ?
                  AND NOT EXISTS (
                      SELECT 1 FROM employee_evaluations ee
                      WHERE ee.employee_id = ?
                        AND ee.evaluated_at >= CAST(n.created_at AS DATE)
                  )
                """, Integer.class, employeeId.longValue(), employeeId);
        return count != null && count > 0;
    }
}
