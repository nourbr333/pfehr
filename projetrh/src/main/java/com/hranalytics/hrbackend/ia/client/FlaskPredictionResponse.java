package com.hranalytics.hrbackend.ia.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/** Mappe la réponse JSON (snake_case) du microservice Flask. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record FlaskPredictionResponse(
        String prediction,
        @JsonProperty("employee_id") Integer employeeId,
        @JsonProperty("risk_proba") double riskProba,
        @JsonProperty("risk_level") String riskLevel,
        @JsonProperty("risk_label") String riskLabel,
        @JsonProperty("top_features") List<FlaskFeature> topFeatures,
        Map<String, Double> thresholds) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FlaskFeature(String name, double importance) {
    }
}
