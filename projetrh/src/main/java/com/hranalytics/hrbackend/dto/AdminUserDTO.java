package com.hranalytics.hrbackend.dto;

public record AdminUserDTO(
        String id,
        String nom,
        String prenom,
        String email,
        String role,
        String statut,
        String dateCreation,
        String derniereConnexion,
        boolean validated) {}
