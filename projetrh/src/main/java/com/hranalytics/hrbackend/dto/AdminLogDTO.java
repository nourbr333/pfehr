package com.hranalytics.hrbackend.dto;

public record AdminLogDTO(
        String id,
        String action,
        String cible,
        String effectuePar,
        String date,
        String details) {}
