package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminRoleUpdateRequest(@NotBlank String role) {}
