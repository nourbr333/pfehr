package com.hranalytics.hrbackend.ia.service;

import com.hranalytics.hrbackend.ia.client.FlaskPredictionResponse;
import com.hranalytics.hrbackend.ia.dto.FeatureImportanceDTO;
import com.hranalytics.hrbackend.ia.dto.PredictionResponseDTO;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.repository.TeamObjectiveRepository;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

/**
 * Orchestration des prédictions IA : calcule les features depuis la BDD,
 * appelle le microservice Flask, et renvoie un DTO normalisé au frontend.
 */
@Service
public class PredictionService {

    private static final Logger log = LoggerFactory.getLogger(PredictionService.class);

    private final EmployeeRepository employeeRepository;
    private final TeamObjectiveRepository teamObjectiveRepository;
    private final RestClient restClient;

    public PredictionService(EmployeeRepository employeeRepository,
                             TeamObjectiveRepository teamObjectiveRepository,
                             @Value("${ia.service.url:http://localhost:5001}") String iaServiceUrl) {
        this.employeeRepository = employeeRepository;
        this.teamObjectiveRepository = teamObjectiveRepository;
        this.restClient = RestClient.builder().baseUrl(iaServiceUrl).build();
    }

    public PredictionResponseDTO predictAbsenteisme(Integer employeeId) {
        List<Object[]> rows = employeeRepository.findAbsenteeismFeatures(employeeId, LocalDate.now());
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Employé introuvable : " + employeeId);
        }

        double[] features = toDoubleArray(rows.get(0));

        Map<String, Object> payload = new HashMap<>();
        payload.put("employee_id", employeeId);
        payload.put("features", features);

        FlaskPredictionResponse flask;
        try {
            flask = restClient.post()
                    .uri("/predict/absenteisme")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(FlaskPredictionResponse.class);
        } catch (RestClientException ex) {
            log.warn("Service IA injoignable pour l'employé {} : {}", employeeId, ex.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Service IA indisponible. Vérifiez que le microservice Flask est démarré.", ex);
        }

        if (flask == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Réponse vide du service IA.");
        }
        return toResponse(flask, employeeId);
    }

    public PredictionResponseDTO predictOkr(Long objectiveId) {
        List<Object[]> rows = teamObjectiveRepository.findOkrFeatures(objectiveId, LocalDate.now());
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Objectif introuvable : " + objectiveId);
        }

        double[] features = toDoubleArray(rows.get(0));

        Map<String, Object> payload = new HashMap<>();
        payload.put("objective_id", objectiveId);
        payload.put("features", features);

        FlaskPredictionResponse flask;
        try {
            flask = restClient.post()
                    .uri("/predict/okr")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(FlaskPredictionResponse.class);
        } catch (RestClientException ex) {
            log.warn("Service IA injoignable pour l'objectif {} : {}", objectiveId, ex.getMessage());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Service IA indisponible. Vérifiez que le microservice Flask est démarré.", ex);
        }

        if (flask == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Réponse vide du service IA.");
        }
        return toResponse(flask, objectiveId.intValue());
    }

    private PredictionResponseDTO toResponse(FlaskPredictionResponse flask, Integer employeeId) {
        List<FeatureImportanceDTO> top = flask.topFeatures() == null ? List.of()
                : flask.topFeatures().stream()
                        .map(f -> new FeatureImportanceDTO(f.name(), f.importance()))
                        .toList();
        return new PredictionResponseDTO(
                flask.prediction(),
                flask.employeeId() != null ? flask.employeeId() : employeeId,
                flask.riskProba(),
                flask.riskLevel(),
                flask.riskLabel(),
                top,
                flask.thresholds());
    }

    private double[] toDoubleArray(Object[] row) {
        double[] out = new double[row.length];
        for (int i = 0; i < row.length; i++) {
            Object value = row[i];
            out[i] = (value instanceof Number n) ? n.doubleValue() : 0.0;
        }
        return out;
    }
}
