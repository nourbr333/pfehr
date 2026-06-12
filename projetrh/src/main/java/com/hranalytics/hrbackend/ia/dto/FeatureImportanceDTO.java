package com.hranalytics.hrbackend.ia.dto;

/** Importance globale d'une feature (issue du modèle), pour l'affichage "facteurs contributifs". */
public record FeatureImportanceDTO(String name, double importance) {
}
