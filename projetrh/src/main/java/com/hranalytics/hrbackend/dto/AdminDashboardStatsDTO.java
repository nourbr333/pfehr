package com.hranalytics.hrbackend.dto;

public record AdminDashboardStatsDTO(
        long totalUsers,
        long actifs,
        long inactifs,
        long recentConnections,
        long activeRolesCount,
        String activeRolesLabel,
        long pendingValidationCount) {}
