package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
        @NotBlank @Size(min = 1, max = 255) String currentPassword,
        @NotBlank @Size(min = 1, max = 255) String newPassword,
        @NotBlank @Size(min = 1, max = 255) String confirmPassword) {}
