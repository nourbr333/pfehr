package com.hranalytics.hrbackend.dto;

import java.util.List;

public record AdminRoleDTO(
        String id,
        String nom,
        String couleur,
        List<String> permissions) {}
