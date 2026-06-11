package com.hranalytics.hrbackend.dto;

public record AuthLoginResponse(
        String token,
        String email,
        String displayName,
        String role,
        String route,
        Integer employeeId,
        Long userId
) {}
