package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.CreateLeaveRequestDto;
import com.hranalytics.hrbackend.dto.LeaveRequestDto;
import com.hranalytics.hrbackend.dto.UpdateLeaveRequestStatusDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SuppressWarnings({"unchecked", "null"})
@ExtendWith(MockitoExtension.class)
class LeaveRequestServiceTest {

    @Mock
    private JdbcTemplate jdbc;

    @InjectMocks
    private LeaveRequestService leaveRequestService;

    @Test
    void create_throwsWhenInsufficientBalance() {
        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(1);
        dto.setType("annual");
        dto.setStartDate("2026-06-08");
        dto.setEndDate("2026-06-12");

        when(jdbc.queryForObject(contains("COUNT"), eq(Integer.class), any(), any(), any()))
                .thenReturn(0);
        when(jdbc.query(contains("GREATEST"), any(ResultSetExtractor.class), any(), any(), any()))
                .thenReturn(2);

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> leaveRequestService.create(dto));
        assertEquals("Solde insuffisant : 2 jour(s) disponible(s), 5 jour(s) demandé(s).", ex.getMessage());
    }

    @Test
    void create_throwsWhenOverlappingRequest() {
        CreateLeaveRequestDto dto = new CreateLeaveRequestDto();
        dto.setEmployeeId(1);
        dto.setType("annual");
        dto.setStartDate("2026-06-08");
        dto.setEndDate("2026-06-12");

        when(jdbc.queryForObject(contains("COUNT"), eq(Integer.class), any(), any(), any()))
                .thenReturn(1);

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> leaveRequestService.create(dto));
        assertEquals(
                "Vous avez déjà une demande de congé (en attente ou approuvée) sur cette période.",
                ex.getMessage()
        );
        verify(jdbc, never()).query(contains("GREATEST"), any(ResultSetExtractor.class), any(), any(), any());
    }

    @Test
    void updateStatus_approvesPendingRequest() {
        UpdateLeaveRequestStatusDto dto = new UpdateLeaveRequestStatusDto();
        dto.setStatus("approved");

        LeaveRequestDto pending = buildPendingRequest();
        LeaveRequestDto approved = buildPendingRequest();
        approved.setStatus("approved");

        when(jdbc.queryForObject(contains("FROM leave_requests"), any(RowMapper.class), eq(1)))
                .thenReturn(pending, approved);

        LeaveRequestDto result = leaveRequestService.updateStatus(1, dto);

        assertEquals("approved", result.getStatus());
        verify(jdbc, atLeastOnce()).update(contains("status = 'approved'"), eq(1));
    }

    private LeaveRequestDto buildPendingRequest() {
        LeaveRequestDto request = new LeaveRequestDto();
        request.setId(1);
        request.setEmployeeId(10);
        request.setType("annual");
        request.setStartDate(LocalDate.of(2026, 7, 1));
        request.setEndDate(LocalDate.of(2026, 7, 5));
        request.setRequestedDays(5);
        request.setStatus("pending");
        return request;
    }
}
