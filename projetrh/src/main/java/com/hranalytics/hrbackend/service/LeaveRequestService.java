package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.*;
import com.hranalytics.hrbackend.util.PaginationSupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class LeaveRequestService {

    private static final Logger log = LoggerFactory.getLogger(LeaveRequestService.class);

    private final JdbcTemplate jdbc;

    public LeaveRequestService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @SuppressWarnings("null")
    public List<LeaveRequestDto> getAll(String status, Integer employeeId) {
        return queryLeaveRequests(status, employeeId, null, null);
    }

    public PageResponse<LeaveRequestDto> getPage(
            String status,
            Integer employeeId,
            int page,
            int size,
            boolean unpaged
    ) {
        if (unpaged) {
            return PageResponse.unpaged(getAll(status, employeeId));
        }
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), PaginationSupport.MAX_SIZE);
        int offset = safePage * safeSize;

        long total = countLeaveRequests(status, employeeId);
        List<LeaveRequestDto> content = queryLeaveRequests(status, employeeId, safeSize, offset);
        int totalPages = safeSize == 0 ? 0 : (int) Math.ceil(total / (double) safeSize);

        PageResponse<LeaveRequestDto> response = new PageResponse<>(
                content,
                total,
                totalPages,
                safePage,
                safeSize
        );
        return response;
    }

    private long countLeaveRequests(String status, Integer employeeId) {
        StringBuilder sql = new StringBuilder(
                "SELECT COUNT(*) FROM leave_requests lr WHERE 1=1"
        );
        List<Object> params = new ArrayList<>();
        appendLeaveRequestFilters(sql, params, status, employeeId);
        Long count = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
        return count == null ? 0L : count;
    }

    private List<LeaveRequestDto> queryLeaveRequests(
            String status,
            Integer employeeId,
            Integer limit,
            Integer offset
    ) {
        StringBuilder sql = new StringBuilder(
            "SELECT lr.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, " +
            "UPPER(LEFT(e.first_name,1)) || UPPER(LEFT(e.last_name,1)) AS employee_avatar, " +
            "d.department_name AS department_name " +
            "FROM leave_requests lr " +
            "LEFT JOIN employees e ON e.employee_id = lr.employee_id " +
            "LEFT JOIN departments d ON d.department_id = e.department_id " +
            "WHERE 1=1"
        );
        List<Object> params = new ArrayList<>();
        appendLeaveRequestFilters(sql, params, status, employeeId);
        sql.append(" ORDER BY lr.requested_at DESC");
        if (limit != null) {
            sql.append(" LIMIT ?");
            params.add(limit);
        }
        if (offset != null) {
            sql.append(" OFFSET ?");
            params.add(offset);
        }
        return jdbc.query(sql.toString(), new LeaveRequestRowMapper(), params.toArray());
    }

    private void appendLeaveRequestFilters(StringBuilder sql, List<Object> params, String status, Integer employeeId) {
        if (status != null && !status.isEmpty()) {
            sql.append(" AND lr.status = ?");
            params.add(status);
        }
        if (employeeId != null) {
            sql.append(" AND lr.employee_id = ?");
            params.add(employeeId);
        }
    }

    public LeaveRequestDto getById(Integer id) {
        return jdbc.queryForObject(
            "SELECT lr.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, " +
            "UPPER(LEFT(e.first_name,1)) || UPPER(LEFT(e.last_name,1)) AS employee_avatar, " +
            "d.department_name AS department_name " +
            "FROM leave_requests lr " +
            "LEFT JOIN employees e ON e.employee_id = lr.employee_id " +
            "LEFT JOIN departments d ON d.department_id = e.department_id " +
            "WHERE lr.id = ?",
            new LeaveRequestRowMapper(), id
        );
    }

    @Transactional
    public LeaveRequestDto create(CreateLeaveRequestDto dto) {
        int requestedDays = countWorkingDays(
            LocalDate.parse(dto.getStartDate()),
            LocalDate.parse(dto.getEndDate())
        );

        // Fix #10 : aucun jour ouvrable dans la période (ex. demande week-end uniquement)
        if (requestedDays == 0) {
            throw new IllegalArgumentException("La période sélectionnée ne contient aucun jour ouvrable.");
        }

        // Fix #9 : détecter un chevauchement avec une demande existante du même employé
        Integer selfOverlap = jdbc.queryForObject(
            "SELECT COUNT(*) FROM leave_requests " +
            "WHERE employee_id = ? AND status IN ('pending','approved') " +
            "AND start_date <= ?::date AND end_date >= ?::date",
            Integer.class,
            dto.getEmployeeId(), dto.getEndDate(), dto.getStartDate()
        );
        if (selfOverlap != null && selfOverlap > 0) {
            throw new IllegalStateException("Vous avez déjà une demande de congé (en attente ou approuvée) sur cette période.");
        }

        // Fix #8 : vérifier le solde disponible (uniquement pour les types avec balance)
        Integer remaining = jdbc.query(
            "SELECT GREATEST(0, entitled + carry_over - used - pending) FROM leave_balances " +
            "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
            rs -> rs.next() ? rs.getInt(1) : null,
            dto.getEmployeeId(), dto.getType(), dto.getStartDate()
        );
        if (remaining != null && remaining < requestedDays) {
            throw new IllegalStateException(
                "Solde insuffisant : " + remaining +
                " jour(s) disponible(s), " + requestedDays + " jour(s) demandé(s)."
            );
        }

        jdbc.update(
            "INSERT INTO leave_requests (employee_id, type, start_date, end_date, requested_days, status, notes) " +
            "VALUES (?, ?, ?::date, ?::date, ?, 'pending', ?)",
            dto.getEmployeeId(), dto.getType(), dto.getStartDate(), dto.getEndDate(), requestedDays, dto.getNotes()
        );

        // Update pending balance
        jdbc.update(
            "UPDATE leave_balances SET pending = pending + ? " +
            "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
            (double) requestedDays, dto.getEmployeeId(), dto.getType(), dto.getStartDate()
        );

        // Sync to absence_requests so the manager can see this pending request.
        // Utiliser afterCommit évite que toute erreur du sync (FK invalide, doublon, etc.)
        // ne bloque ou n'annule l'insertion dans leave_requests.
        final Integer empId    = dto.getEmployeeId();
        final String  type     = dto.getType();
        final String  start    = dto.getStartDate();
        final String  end      = dto.getEndDate();
        final String  notes    = dto.getNotes();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    syncAbsenceRequestCreate(empId, type, start, end, notes);
                } catch (Exception e) {
                    log.warn("syncAbsenceRequestCreate afterCommit failed for employee {}: {}", empId, e.getMessage());
                }
            }
        });

        Integer id = jdbc.queryForObject("SELECT currval(pg_get_serial_sequence('leave_requests','id'))", Integer.class);
        if (id == null) return null;
        return getById(id);
    }

    @Transactional
    public LeaveRequestDto updateStatus(Integer id, UpdateLeaveRequestStatusDto dto) {
        LeaveRequestDto existing = getById(id);

        // Bloquer toute action sur une demande arrivée à échéance
        if ("expired".equals(existing.getStatus())) {
            throw new IllegalStateException("Cette demande est arrivée à échéance et ne peut plus être traitée.");
        }
        // Bloquer l'approbation d'une demande entièrement écoulée (fin < aujourd'hui)
        if ("approved".equals(dto.getStatus()) && existing.getEndDate().isBefore(LocalDate.now())) {
            throw new IllegalStateException("Impossible d'approuver une demande dont la période est entièrement écoulée.");
        }

        // Audit
        jdbc.update(
            "INSERT INTO leave_request_audit (request_id, old_status, new_status, reason) VALUES (?, ?, ?, ?)",
            id, existing.getStatus(), dto.getStatus(), dto.getRejectionReason()
        );

        if ("approved".equals(dto.getStatus())) {
            jdbc.update("UPDATE leave_requests SET status = 'approved', reviewed_at = NOW() WHERE id = ?", id);
            // Move from pending to used
            jdbc.update(
                "UPDATE leave_balances SET used = used + ?, pending = GREATEST(0, pending - ?) " +
                "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
                (double) existing.getRequestedDays(), (double) existing.getRequestedDays(),
                existing.getEmployeeId(), existing.getType(), existing.getStartDate().toString()
            );
        } else if ("rejected".equals(dto.getStatus()) || "cancelled".equals(dto.getStatus())) {
            jdbc.update(
                "UPDATE leave_requests SET status = ?, rejection_reason = ?, reviewed_at = NOW() WHERE id = ?",
                dto.getStatus(), dto.getRejectionReason(), id
            );
            // Release pending
            jdbc.update(
                "UPDATE leave_balances SET pending = GREATEST(0, pending - ?) " +
                "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
                (double) existing.getRequestedDays(),
                existing.getEmployeeId(), existing.getType(), existing.getStartDate().toString()
            );
        }

        // Sync status change to absence_requests
        syncAbsenceRequestStatus(existing.getEmployeeId(), existing.getStartDate().toString(),
            existing.getEndDate().toString(), dto.getStatus(), existing.getType());

        return getById(id);
    }

    public void delete(Integer id) {
        LeaveRequestDto existing = getById(id);
        if (!"pending".equals(existing.getStatus()) && !"draft".equals(existing.getStatus())) {
            throw new IllegalStateException("Can only delete pending or draft requests");
        }
        // Release pending balance
        jdbc.update(
            "UPDATE leave_balances SET pending = GREATEST(0, pending - ?) " +
            "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
            (double) existing.getRequestedDays(),
            existing.getEmployeeId(), existing.getType(), existing.getStartDate().toString()
        );
        jdbc.update("DELETE FROM leave_requests WHERE id = ?", id);
        // Remove from absence_requests
        jdbc.update(
            "DELETE FROM absence_requests WHERE employee_id = ? AND start_date = ?::date AND end_date = ?::date",
            existing.getEmployeeId(), existing.getStartDate().toString(), existing.getEndDate().toString()
        );
    }

    public List<LeaveConflictDto> detectConflicts(Integer employeeId, String startDate, String endDate) {
        // Find department of the employee
        String department = jdbc.queryForObject(
            "SELECT d.department_name FROM employees e JOIN departments d ON e.department_id = d.department_id WHERE e.employee_id = ?",
            String.class, employeeId
        );

        // Find overlapping approved/pending requests in same department
        List<String> overlapping = jdbc.queryForList(
            "SELECT DISTINCT CONCAT(e.first_name, ' ', e.last_name) FROM leave_requests lr " +
            "JOIN employees e ON e.employee_id = lr.employee_id " +
            "JOIN departments d ON e.department_id = d.department_id " +
            "WHERE d.department_name = ? AND lr.status IN ('pending','approved') " +
            "AND lr.start_date <= ?::date AND lr.end_date >= ?::date " +
            "AND lr.employee_id != ?",
            String.class, department, endDate, startDate, employeeId
        );

        int headcount = java.util.Objects.requireNonNullElse(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM employees e JOIN departments d ON e.department_id = d.department_id WHERE d.department_name = ?",
                Integer.class, department
            ), 1);
        if (headcount < 1) headcount = 1;
        int absenceCount = overlapping.size() + 1; // +1 for the new request
        double rate = (absenceCount * 100.0) / headcount;

        LeaveConflictDto conflict = new LeaveConflictDto();
        conflict.setDepartment(department);
        conflict.setOverlappingEmployees(overlapping);
        conflict.setAbsenceCount(absenceCount);
        conflict.setDepartmentHeadcount(headcount);
        conflict.setAbsenceRate(rate);
        conflict.setExceedsThreshold(rate > 30);

        List<LeaveConflictDto> result = new ArrayList<>();
        if (!overlapping.isEmpty()) {
            result.add(conflict);
        }
        return result;
    }

    // ── absence_requests sync helpers ─────────────────────────────────────

    /**
     * Insert a new row into absence_requests when a leave_request is created (status = pending).
     * manager_id is resolved from employees.manager_id for the given employee.
     */
    private void syncAbsenceRequestCreate(Integer employeeId, String type, String startDate, String endDate, String reason) {
        Integer managerId = resolveManagerId(employeeId);
        if (managerId == null) return;
        jdbc.update(
            "INSERT INTO absence_requests (employee_id, manager_id, absence_type, status, start_date, end_date, reason, requested_at, continuity_required) " +
            "VALUES (?, ?, ?, 'en_attente', ?::date, ?::date, ?, NOW(), false)",
            employeeId, managerId, toAbsenceType(type), startDate, endDate, reason == null ? "" : reason
        );
    }

    /**
     * Update the matching absence_requests row when the leave_request status changes.
     * If no row exists yet (legacy data), an INSERT is performed.
     */
    private void syncAbsenceRequestStatus(Integer employeeId, String startDate, String endDate, String newLeaveStatus, String type) {
        String absenceStatus = toAbsenceStatus(newLeaveStatus);
        int rows = jdbc.update(
            "UPDATE absence_requests SET status = ?, decided_at = NOW() " +
            "WHERE employee_id = ? AND start_date = ?::date AND end_date = ?::date",
            absenceStatus, employeeId, startDate, endDate
        );
        if (rows == 0) {
            // No existing row — insert one so the manager sees it (handles legacy leave_requests)
            syncAbsenceRequestCreate(employeeId, type, startDate, endDate, null);
            jdbc.update(
                "UPDATE absence_requests SET status = ?, decided_at = NOW() " +
                "WHERE employee_id = ? AND start_date = ?::date AND end_date = ?::date",
                absenceStatus, employeeId, startDate, endDate
            );
        }
    }

    /** Look up the manager_id for a given employee. Returns null if not found or unset. */
    private Integer resolveManagerId(Integer employeeId) {
        List<Integer> results = jdbc.query(
            "SELECT manager_id FROM employees WHERE employee_id = ?",
            (rs, rowNum) -> rs.getObject("manager_id", Integer.class),
            employeeId
        );
        return results.isEmpty() ? null : results.get(0);
    }

    /** Map leave_requests.type to the absence_type used in absence_requests.
     *  Both tables now share the same vocabulary: conge-paye, maladie, sans-solde, evenement-familial, autre.
     */
    private static String toAbsenceType(String type) {
        if (type == null) return "conge-paye";
        switch (type.toLowerCase().trim()) {
            case "maladie": return "maladie";
            case "sans-solde": return "sans-solde";
            case "evenement-familial": return "evenement-familial";
            case "autre": return "autre";
            default: return "conge-paye";
        }
    }

    /** Map leave_requests.status to the status enum used in absence_requests. */
    private static String toAbsenceStatus(String leaveStatus) {
        if (leaveStatus == null) return "en_attente";
        switch (leaveStatus.toLowerCase()) {
            case "approved": return "approuvee";
            case "rejected": case "cancelled": case "expired": return "refusee";
            default: return "en_attente";
        }
    }

    private int countWorkingDays(LocalDate start, LocalDate end) {
        int count = 0;
        LocalDate cursor = start;
        while (!cursor.isAfter(end)) {
            DayOfWeek dow = cursor.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) {
                count++;
            }
            cursor = cursor.plusDays(1);
        }
        return count;
    }

    public int countOngoingThisMonth() {
        LocalDate monthStart = LocalDate.now().withDayOfMonth(1);
        LocalDate monthEnd = LocalDate.now().withDayOfMonth(LocalDate.now().lengthOfMonth());
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM leave_requests WHERE status = 'approved' " +
            "AND start_date <= ? AND end_date >= ?",
            Integer.class, monthEnd, monthStart
        );
        return count != null ? count : 0;
    }

    public int countPending() {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'",
            Integer.class
        );
        return count != null ? count : 0;
    }

    /**
     * Marque automatiquement comme 'expired' toutes les demandes encore en statut 'pending'
     * dont la date de FIN est strictement antérieure à aujourd'hui
     * (toute la période de congé est passée sans décision du responsable).
     * Libère le solde en attente correspondant et synchronise absence_requests.
     * Appelé au démarrage de l'application et quotidiennement par {@link LeaveRequestExpiryScheduler}.
     */
    @Transactional
    public int expirePendingRequests() {
        List<LeaveRequestDto> toExpire = jdbc.query(
            "SELECT lr.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, " +
            "UPPER(LEFT(e.first_name,1)) || UPPER(LEFT(e.last_name,1)) AS employee_avatar, " +
            "d.department_name AS department_name " +
            "FROM leave_requests lr " +
            "LEFT JOIN employees e ON e.employee_id = lr.employee_id " +
            "LEFT JOIN departments d ON d.department_id = e.department_id " +
            "WHERE lr.status = 'pending' AND lr.end_date < CURRENT_DATE",
            new LeaveRequestRowMapper()
        );

        for (LeaveRequestDto lr : toExpire) {
            // Audit
            jdbc.update(
                "INSERT INTO leave_request_audit (request_id, old_status, new_status, reason) VALUES (?, ?, ?, ?)",
                lr.getId(), "pending", "expired",
                "Arrivée à échéance sans réponse"
            );
            // Marquer expired
            jdbc.update(
                "UPDATE leave_requests SET status = 'expired', reviewed_at = NOW() WHERE id = ?",
                lr.getId()
            );
            // Libérer le solde en attente
            jdbc.update(
                "UPDATE leave_balances SET pending = GREATEST(0, pending - ?) " +
                "WHERE employee_id = ? AND type = ? AND year = EXTRACT(YEAR FROM ?::date)::INTEGER",
                (double) lr.getRequestedDays(),
                lr.getEmployeeId(), lr.getType(), lr.getStartDate().toString()
            );
            // Sync absence_requests
            syncAbsenceRequestStatus(
                lr.getEmployeeId(),
                lr.getStartDate().toString(),
                lr.getEndDate().toString(),
                "expired",
                lr.getType()
            );
        }
        return toExpire.size();
    }

    private static class LeaveRequestRowMapper implements RowMapper<LeaveRequestDto> {
        @Override
        public LeaveRequestDto mapRow(@NonNull ResultSet rs, int rowNum) throws SQLException {
            LeaveRequestDto dto = new LeaveRequestDto();
            dto.setId(rs.getInt("id"));
            dto.setEmployeeId(rs.getInt("employee_id"));
            dto.setType(rs.getString("type"));
            dto.setStartDate(rs.getDate("start_date").toLocalDate());
            dto.setEndDate(rs.getDate("end_date").toLocalDate());
            dto.setRequestedDays(rs.getInt("requested_days"));
            dto.setStatus(rs.getString("status"));
            dto.setNotes(rs.getString("notes"));
            dto.setRejectionReason(rs.getString("rejection_reason"));
            dto.setConflictsDetected(rs.getBoolean("conflicts_detected"));
            if (rs.getTimestamp("requested_at") != null) {
                dto.setRequestedAt(rs.getTimestamp("requested_at").toInstant().atOffset(java.time.ZoneOffset.UTC));
            }
            if (rs.getTimestamp("reviewed_at") != null) {
                dto.setReviewedAt(rs.getTimestamp("reviewed_at").toInstant().atOffset(java.time.ZoneOffset.UTC));
            }
            dto.setReviewedBy(rs.getObject("reviewed_by") != null ? rs.getInt("reviewed_by") : null);
            dto.setEmployeeName(rs.getString("employee_name"));
            dto.setEmployeeAvatar(rs.getString("employee_avatar"));
            dto.setDepartment(rs.getString("department_name"));
            return dto;
        }
    }
}
