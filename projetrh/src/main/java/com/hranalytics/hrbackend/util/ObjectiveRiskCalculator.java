package com.hranalytics.hrbackend.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * Computes OKR risk status from due date, current progress and timeline (created_at).
 * Single source of truth — not user-editable.
 */
public final class ObjectiveRiskCalculator {

    private static final int ON_TRACK_MARGIN = 10;
    private static final int AT_RISK_MARGIN = 25;

    private ObjectiveRiskCalculator() {}

    public record RiskEvaluation(String status, String reason, int delayDays) {}

    public static RiskEvaluation evaluate(
            LocalDate dueDate,
            BigDecimal progressPercent,
            LocalDateTime createdAt,
            LocalDate today) {
        if (today == null) {
            today = LocalDate.now();
        }
        double progress = toPercent(progressPercent);
        int delayDays = computeDelayDays(dueDate, today);

        if (progress >= 100) {
            return new RiskEvaluation("ON_TRACK", "Objectif atteint à 100%.", delayDays);
        }

        if (dueDate != null && today.isAfter(dueDate)) {
            return new RiskEvaluation(
                    "OFF_TRACK",
                    String.format(
                            "Échéance dépassée de %d jour(s) — progression %.0f%%.",
                            delayDays, progress),
                    delayDays);
        }

        double expected = computeExpectedProgress(createdAt, dueDate, today);
        long daysRemaining = dueDate == null ? 0 : ChronoUnit.DAYS.between(today, dueDate);
        String timeline = daysRemaining > 0
                ? String.format(" (J-%d)", daysRemaining)
                : "";

        String reason = String.format(
                "Progression %.0f%% vs %.0f%% attendus%s.",
                progress, expected, timeline);

        if (progress >= expected - ON_TRACK_MARGIN) {
            return new RiskEvaluation("ON_TRACK", reason, delayDays);
        }
        if (progress >= expected - AT_RISK_MARGIN) {
            return new RiskEvaluation("AT_RISK", reason, delayDays);
        }
        return new RiskEvaluation("OFF_TRACK", reason, delayDays);
    }

    private static double computeExpectedProgress(
            LocalDateTime createdAt, LocalDate dueDate, LocalDate today) {
        if (createdAt == null || dueDate == null) {
            return 100.0;
        }
        LocalDate start = createdAt.toLocalDate();
        long total = ChronoUnit.DAYS.between(start, dueDate);
        if (total <= 0) {
            return 100.0;
        }
        long elapsed = ChronoUnit.DAYS.between(start, today);
        double ratio = Math.max(0.0, Math.min(1.0, (double) elapsed / total));
        return ratio * 100.0;
    }

    private static int computeDelayDays(LocalDate dueDate, LocalDate today) {
        if (dueDate == null || !today.isAfter(dueDate)) {
            return 0;
        }
        return (int) ChronoUnit.DAYS.between(dueDate, today);
    }

    private static double toPercent(BigDecimal value) {
        if (value == null) {
            return 0.0;
        }
        return value.setScale(1, RoundingMode.HALF_UP).doubleValue();
    }
}
