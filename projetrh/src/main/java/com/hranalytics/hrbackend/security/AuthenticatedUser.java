package com.hranalytics.hrbackend.security;

/**
 * Principal attached to the Spring Security context after JWT validation.
 */
public class AuthenticatedUser {

    private final String email;
    private final String role;
    private final Long userId;
    private final Integer employeeId;

    public AuthenticatedUser(String email, String role, Long userId, Integer employeeId) {
        this.email = email;
        this.role = role;
        this.userId = userId;
        this.employeeId = employeeId;
    }

    public String getEmail() {
        return email;
    }

    public String getRole() {
        return role;
    }

    public Long getUserId() {
        return userId;
    }

    public Integer getEmployeeId() {
        return employeeId;
    }
}
