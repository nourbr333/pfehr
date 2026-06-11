package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SsoLoginRequest(
        @NotBlank @Size(max = 255) String username, @NotBlank @Size(max = 255) String password) {}
