package com.hranalytics.hrbackend.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminPasswordResetRequest(@NotBlank String password) {}
