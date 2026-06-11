package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.AdjustLeaveBalanceDto;
import com.hranalytics.hrbackend.dto.LeaveBalanceDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;

@Service
public class LeaveBalanceService {

    private final JdbcTemplate jdbc;

    public LeaveBalanceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<LeaveBalanceDto> getAll(Integer year) {
        int targetYear = (year != null) ? year : LocalDate.now().getYear();
        return jdbc.query(
            "SELECT *, GREATEST(0, entitled + carry_over - used - pending) AS remaining FROM leave_balances WHERE type = 'conge-paye' AND year = ? ORDER BY employee_id",
            new LeaveBalanceRowMapper(), targetYear
        );
    }

    public List<LeaveBalanceDto> getByEmployee(Integer employeeId, Integer year) {
        int targetYear = (year != null) ? year : LocalDate.now().getYear();
        return jdbc.query(
            "SELECT *, GREATEST(0, entitled + carry_over - used - pending) AS remaining FROM leave_balances WHERE type = 'conge-paye' AND employee_id = ? AND year = ?",
            new LeaveBalanceRowMapper(), employeeId, targetYear
        );
    }

    @Transactional
    public LeaveBalanceDto adjust(Integer id, AdjustLeaveBalanceDto dto) {
        if (dto.getReason() == null || dto.getReason().trim().length() < 5) {
            throw new IllegalArgumentException("Reason must be at least 5 characters");
        }
        // Record adjustment
        jdbc.update(
            "INSERT INTO leave_balance_adjustments (balance_id, adjustment, reason) VALUES (?, ?, ?)",
            id, dto.getAdjustment(), dto.getReason()
        );
        // Apply to entitled
        jdbc.update(
            "UPDATE leave_balances SET entitled = entitled + ? WHERE id = ?",
            dto.getAdjustment(), id
        );
        return jdbc.queryForObject(
            "SELECT *, GREATEST(0, entitled + carry_over - used - pending) AS remaining FROM leave_balances WHERE id = ?",
            new LeaveBalanceRowMapper(), id
        );
    }

    @Transactional
    public List<LeaveBalanceDto> recompute(Integer employeeId, Integer year) {
        // Fix #7 : lire le nombre de jours depuis la politique (évite le hardcode 18)
        Integer policyDays = jdbc.query(
            "SELECT max_days_per_year FROM leave_policies WHERE type = 'conge-paye' AND is_active = TRUE LIMIT 1",
            rs -> rs.next() ? rs.getInt("max_days_per_year") : null
        );
        int entitledDays = (policyDays != null && policyDays > 0) ? policyDays : 18;
        jdbc.update(
            "INSERT INTO leave_balances (employee_id, type, year, entitled) " +
            "VALUES (?, 'conge-paye', ?, ?) " +
            "ON CONFLICT (employee_id, type, year) DO UPDATE SET entitled = GREATEST(leave_balances.entitled, ?)",
            employeeId, year, entitledDays, entitledDays
        );
        // Recompute used/pending from approved/pending leave_requests (conge-paye only)
        jdbc.update(
            "UPDATE leave_balances lb SET used = COALESCE((" +
            "  SELECT SUM(lr.requested_days) FROM leave_requests lr " +
            "  WHERE lr.employee_id = lb.employee_id AND lr.type = 'conge-paye' " +
            "  AND lr.status = 'approved' AND EXTRACT(YEAR FROM lr.start_date)::INTEGER = lb.year" +
            "), 0), pending = COALESCE((" +
            "  SELECT SUM(lr.requested_days) FROM leave_requests lr " +
            "  WHERE lr.employee_id = lb.employee_id AND lr.type = 'conge-paye' " +
            "  AND lr.status = 'pending' AND EXTRACT(YEAR FROM lr.start_date)::INTEGER = lb.year" +
            "), 0) WHERE employee_id = ? AND year = ? AND type = 'conge-paye'",
            employeeId, year
        );
        return getByEmployee(employeeId, year);
    }

    /**
     * Initialise les soldes congés pour un nouvel employé.
     * Crée une ligne conge-paye pour l'année en cours si elle n'existe pas encore.
     * Appelé automatiquement à la création d'un employé.
     */
    public void initializeForEmployee(Integer employeeId) {
        int year = LocalDate.now().getYear();
        // Récupère le max_days_per_year depuis les politiques actives, sinon 18 par défaut
        Integer entitled = jdbc.query(
            "SELECT max_days_per_year FROM leave_policies WHERE type = 'conge-paye' AND is_active = TRUE LIMIT 1",
            rs -> rs.next() ? rs.getInt("max_days_per_year") : null
        );
        int days = (entitled != null && entitled > 0) ? entitled : 18;
        jdbc.update(
            "INSERT INTO leave_balances (employee_id, type, year, entitled) " +
            "VALUES (?, 'conge-paye', ?, ?) " +
            "ON CONFLICT (employee_id, type, year) DO NOTHING",
            employeeId, year, days
        );
    }

    private static class LeaveBalanceRowMapper implements RowMapper<LeaveBalanceDto> {
        @Override
        public LeaveBalanceDto mapRow(@NonNull ResultSet rs, int rowNum) throws SQLException {
            LeaveBalanceDto dto = new LeaveBalanceDto();
            dto.setId(rs.getInt("id"));
            dto.setEmployeeId(rs.getInt("employee_id"));
            dto.setType(rs.getString("type"));
            dto.setYear(rs.getInt("year"));
            dto.setEntitled(rs.getDouble("entitled"));
            dto.setUsed(rs.getDouble("used"));
            dto.setPending(rs.getDouble("pending"));
            dto.setCarryOver(rs.getDouble("carry_over"));
            dto.setRemaining(rs.getDouble("remaining"));
            if (rs.getDate("expires_at") != null) {
                dto.setExpiresAt(rs.getDate("expires_at").toLocalDate());
            }
            return dto;
        }
    }
}
