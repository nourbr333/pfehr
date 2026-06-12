package com.hranalytics.hrbackend.ia.dto;

import java.util.List;
import java.util.Map;

/**
 * Réponse de prédiction renvoyée au frontend (camelCase).
 *
 * @param prediction   identifiant de la prédiction (ex. "absenteisme")
 * @param employeeId   employé concerné
 * @param riskProba    probabilité de risque [0,1]
 * @param riskLevel    LOW / MEDIUM / HIGH
 * @param riskLabel    libellé lisible (FR)
 * @param topFeatures  facteurs contributifs (importances globales du modèle)
 * @param thresholds   seuils utilisés (high / medium)
 */
public record PredictionResponseDTO(
        String prediction,
        Integer employeeId,
        double riskProba,
        String riskLevel,
        String riskLabel,
        List<FeatureImportanceDTO> topFeatures,
        Map<String, Double> thresholds) {
}
