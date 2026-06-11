package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.*;
import com.hranalytics.hrbackend.entity.KpiThreshold;
import com.hranalytics.hrbackend.model.KpiKey;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.repository.KpiThresholdRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
public class KpiThresholdService {

    private final KpiThresholdRepository repository;
    private final AppUserRepository appUserRepository;
    private final NotificationService notificationService;

    public KpiThresholdService(KpiThresholdRepository repository,
                               AppUserRepository appUserRepository,
                               NotificationService notificationService) {
        this.repository = repository;
        this.appUserRepository = appUserRepository;
        this.notificationService = notificationService;
    }

    public List<KpiThresholdDTO> getByUser(Long userId) {
        requireUser(userId);
        return repository.findByUserId(userId)
                .stream()
                .map(this::toDTO)
                .toList();
    }

    @Transactional
    public KpiThresholdDTO save(KpiThresholdSaveRequest req) {
        if (req.getUserId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "userId is required");
        }
        requireUser(req.getUserId());

        KpiKey kpiKey = KpiKey.fromKey(req.getKpiKey());
        validateThresholdTarget(kpiKey, req.getThresholdValue(), req.getTargetValue());

        KpiThreshold entity = repository
                .findByUserIdAndKpiKey(req.getUserId(), kpiKey.getKey())
                .orElseGet(KpiThreshold::new);

        LocalDateTime now = LocalDateTime.now();
        if (entity.getId() == null) {
            entity.setCreatedAt(now);
        }
        entity.setUpdatedAt(now);
        entity.setUserId(req.getUserId());
        entity.setKpiKey(kpiKey.getKey());
        entity.setKpiLabel(req.getKpiLabel());
        entity.setPeriodLabel(req.getPeriodLabel());
        entity.setThresholdValue(req.getThresholdValue());
        entity.setTargetValue(req.getTargetValue());
        entity.setPhraseOfficielle(req.getPhraseOfficielle());

        return toDTO(repository.save(entity));
    }

    @Transactional
    @SuppressWarnings("null")
    public void delete(Long id, Long authenticatedUserId, boolean admin) {
        KpiThreshold threshold = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "KPI threshold not found"));
        if (!admin && (authenticatedUserId == null || !authenticatedUserId.equals(threshold.getUserId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès refusé à ce seuil KPI.");
        }
        repository.deleteById(id);
    }

    @Transactional
    public List<KpiThresholdCheckResult> checkBatch(KpiThresholdCheckBatchRequest req) {
        List<KpiThresholdCheckResult> results = new ArrayList<>();
        if (req.getEntries() == null || req.getUserId() == null) return results;
        requireUser(req.getUserId());

        for (KpiThresholdCheckBatchRequest.KpiValueEntry entry : req.getEntries()) {
            if (!KpiKey.isAllowed(entry.getKpiKey())) continue;
            repository
                .findByUserIdAndKpiKey(req.getUserId(), KpiKey.fromKey(entry.getKpiKey()).getKey())
                .ifPresent(threshold -> results.add(evaluate(threshold, entry.getCurrentValue())));
        }
        return results;
    }

    private KpiThresholdCheckResult evaluate(KpiThreshold t, BigDecimal current) {
        KpiThresholdCheckResult result = new KpiThresholdCheckResult();
        result.setKpiKey(t.getKpiKey());

        KpiKey kpiKey = KpiKey.fromKey(t.getKpiKey());
        boolean higherIsBetter = kpiKey.isHigherIsBetter();
        boolean breached = false;
        boolean achieved = false;

        if (t.getThresholdValue() != null && current != null) {
            breached = higherIsBetter
                    ? current.compareTo(t.getThresholdValue()) < 0
                    : current.compareTo(t.getThresholdValue()) > 0;
        }

        if (t.getTargetValue() != null && current != null) {
            achieved = higherIsBetter
                    ? current.compareTo(t.getTargetValue()) >= 0
                    : current.compareTo(t.getTargetValue()) <= 0;
        }

        result.setThresholdBreached(breached);
        result.setTargetAchieved(achieved);

        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        String targetUrl = targetUrlFor(t.getKpiKey());

        if (breached) {
            String msg = buildNotifMessage("Seuil dépassé", t, current, now);
            result.setNotificationMessage(msg);
            notificationService.clearKpiThresholdNotification(t.getUserId(), t.getId(), "performance");
            notificationService.upsertKpiThresholdNotification(
                    t.getUserId(), "avertissement",
                    "Seuil KPI dépassé — " + safeLabel(t),
                    msg, t.getId(), targetUrl);
        } else if (achieved) {
            String msg = buildNotifMessage("Cible atteinte", t, current, now);
            result.setNotificationMessage(msg);
            notificationService.clearKpiThresholdNotification(t.getUserId(), t.getId(), "avertissement");
            notificationService.upsertKpiThresholdNotification(
                    t.getUserId(), "performance",
                    "Cible KPI atteinte — " + safeLabel(t),
                    msg, t.getId(), targetUrl);
        } else {
            notificationService.clearKpiThresholdNotifications(t.getUserId(), t.getId());
        }

        return result;
    }

    private String buildNotifMessage(String prefix, KpiThreshold t, BigDecimal current, String now) {
        StringBuilder sb = new StringBuilder();
        sb.append(prefix).append(" | ").append(now).append(" | ")
          .append(safeLabel(t)).append(" : ")
          .append(formatValue(current));
        if (t.getPhraseOfficielle() != null && !t.getPhraseOfficielle().isBlank()) {
            sb.append("\n").append(t.getPhraseOfficielle());
        }
        return sb.toString();
    }

    private String formatValue(BigDecimal current) {
        return current != null ? current.stripTrailingZeros().toPlainString() + "%" : "?";
    }

    private String safeLabel(KpiThreshold t) {
        return t.getKpiLabel() != null ? t.getKpiLabel() : t.getKpiKey();
    }

    private String targetUrlFor(String kpiKey) {
        return switch (kpiKey) {
            case "attendance", "absenteisme", "retard" -> "/absences-conges";
            default -> "/accueil-resp";
        };
    }

    private void validateThresholdTarget(KpiKey kpiKey, BigDecimal threshold, BigDecimal target) {
        if (threshold == null || target == null) return;
        if (kpiKey.isHigherIsBetter()) {
            if (target.compareTo(threshold) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "L'objectif cible doit être supérieur au seuil d'alerte pour ce KPI.");
            }
        } else if (target.compareTo(threshold) >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "L'objectif cible doit être inférieur au seuil d'alerte pour ce KPI.");
        }
    }

    @SuppressWarnings("null")
    private void requireUser(Long userId) {
        if (!appUserRepository.existsById(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown userId: " + userId);
        }
    }

    private KpiThresholdDTO toDTO(KpiThreshold e) {
        KpiThresholdDTO dto = new KpiThresholdDTO();
        dto.setId(e.getId());
        dto.setUserId(e.getUserId());
        dto.setKpiKey(e.getKpiKey());
        dto.setKpiLabel(e.getKpiLabel());
        dto.setPeriodLabel(e.getPeriodLabel());
        dto.setThresholdValue(e.getThresholdValue());
        dto.setTargetValue(e.getTargetValue());
        dto.setPhraseOfficielle(e.getPhraseOfficielle());
        dto.setCreatedAt(e.getCreatedAt());
        dto.setUpdatedAt(e.getUpdatedAt());
        return dto;
    }
}
