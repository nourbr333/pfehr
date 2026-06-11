package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.LeavePolicyDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class LeavePolicyService {

    private final JdbcTemplate jdbc;

    public LeavePolicyService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<LeavePolicyDto> getAll() {
        return jdbc.query(
            "SELECT * FROM leave_policies ORDER BY id",
            new LeavePolicyRowMapper()
        );
    }

    @Transactional
    public LeavePolicyDto update(Integer id, LeavePolicyDto dto) {
        List<String> setClauses = new ArrayList<>();
        List<Object> params = new ArrayList<>();

        if (dto.getMaxDaysPerYear() != null) {
            setClauses.add("max_days_per_year = ?");
            params.add(dto.getMaxDaysPerYear());
        }
        if (dto.getRequiresDocument() != null) {
            setClauses.add("requires_document = ?");
            params.add(dto.getRequiresDocument());
        }
        if (dto.getIsActive() != null) {
            setClauses.add("is_active = ?");
            params.add(dto.getIsActive());
        }

        if (setClauses.isEmpty()) {
            return getById(id);
        }

        params.add(id);
        jdbc.update(
            "UPDATE leave_policies SET " + String.join(", ", setClauses) + " WHERE id = ?",
            params.toArray()
        );

        // Propager le nouveau entitled vers tous les soldes de l'année en cours
        if (dto.getMaxDaysPerYear() != null) {
            int currentYear = LocalDate.now().getYear();
            jdbc.update(
                "UPDATE leave_balances lb " +
                "SET entitled = ? " +
                "FROM leave_policies lp " +
                "WHERE lp.id = ? AND lb.type = lp.type AND lb.year = ?",
                dto.getMaxDaysPerYear(), id, currentYear
            );
        }

        return getById(id);
    }

    private LeavePolicyDto getById(Integer id) {
        return jdbc.queryForObject(
            "SELECT * FROM leave_policies WHERE id = ?",
            new LeavePolicyRowMapper(), id
        );
    }

    private static class LeavePolicyRowMapper implements RowMapper<LeavePolicyDto> {
        @Override
        public LeavePolicyDto mapRow(@NonNull ResultSet rs, int rowNum) throws SQLException {
            LeavePolicyDto dto = new LeavePolicyDto();
            dto.setId(rs.getInt("id"));
            dto.setType(rs.getString("type"));
            dto.setLabel(rs.getString("label"));
            dto.setMaxDaysPerYear(rs.getInt("max_days_per_year"));
            dto.setRequiresDocument(rs.getBoolean("requires_document"));
            dto.setColor(rs.getString("color"));
            dto.setIsActive(rs.getBoolean("is_active"));
            return dto;
        }
    }
}
