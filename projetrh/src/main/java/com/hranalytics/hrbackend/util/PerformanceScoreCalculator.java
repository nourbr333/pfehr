package com.hranalytics.hrbackend.util;

import com.hranalytics.hrbackend.entity.Attendance;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalDouble;

/** Score composite : présence 40% · évaluation 40% · ponctualité 20% (mois courant). */
public final class PerformanceScoreCalculator {

    private static final double W_PRESENCE = 0.40;
    private static final double W_EVALUATION = 0.40;
    private static final double W_PUNCTUALITY = 0.20;

    private PerformanceScoreCalculator() {
    }

    public static LocalDate firstDayOfMonth(LocalDate referenceDate) {
        return referenceDate.withDayOfMonth(1);
    }

    public static LocalDate lastDayOfMonth(LocalDate referenceDate) {
        return firstDayOfMonth(referenceDate).plusMonths(1).minusDays(1);
    }

    public static boolean isWithinMonth(LocalDate date, LocalDate referenceDate) {
        if (date == null) {
            return false;
        }
        LocalDate first = firstDayOfMonth(referenceDate);
        LocalDate last = lastDayOfMonth(referenceDate);
        return !date.isBefore(first) && !date.isAfter(last);
    }

    public static List<Attendance> filterAttendanceForMonth(List<Attendance> rows, LocalDate referenceDate) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        return rows.stream()
                .filter(row -> isWithinMonth(row.getAttendanceDate(), referenceDate))
                .toList();
    }

    public static List<EmployeeEvaluation> filterEvaluationsForMonth(
            List<EmployeeEvaluation> evaluations, LocalDate referenceDate) {
        if (evaluations == null || evaluations.isEmpty()) {
            return List.of();
        }
        return evaluations.stream()
                .filter(evaluation -> evaluation.getRating() != null
                        && isWithinMonth(evaluation.getEvaluatedAt(), referenceDate))
                .toList();
    }

    public static Double attendanceRate(List<Attendance> monthRows) {
        if (monthRows == null || monthRows.isEmpty()) {
            return null;
        }
        long presentDays = monthRows.stream().filter(row -> Boolean.TRUE.equals(row.getIsPresent())).count();
        return presentDays * 100.0 / monthRows.size();
    }

    public static Double punctualityScore(List<Attendance> monthRows) {
        if (monthRows == null || monthRows.isEmpty()) {
            return null;
        }
        long lateDays = monthRows.stream().filter(row -> Boolean.TRUE.equals(row.getIsLate())).count();
        return (1.0 - (double) lateDays / monthRows.size()) * 100.0;
    }

    public static double normalizedRating(Integer rating) {
        if (rating == null) {
            return 0.0;
        }
        double raw = rating.doubleValue();
        double normalized = raw > 5.0 ? raw : (raw * 20.0);
        return Math.max(0.0, Math.min(100.0, normalized));
    }

    public static Optional<EmployeeEvaluation> latestEvaluationInMonth(
            List<EmployeeEvaluation> evaluations, LocalDate referenceDate) {
        return filterEvaluationsForMonth(evaluations, referenceDate).stream()
                .max(Comparator
                        .comparing(EmployeeEvaluation::getEvaluatedAt, Comparator.nullsLast(LocalDate::compareTo))
                        .thenComparing(
                                evaluation -> evaluation.getEvaluationId() == null ? 0 : evaluation.getEvaluationId()));
    }

    /**
     * Score composite avec redistribution des poids sur les composantes disponibles.
     * Retourne vide si aucune composante n'est disponible.
     */
    public static OptionalDouble computeComposite(
            Double attendanceRate, Integer evaluationRating, Double punctualityScore) {
        if (attendanceRate == null && evaluationRating == null && punctualityScore == null) {
            return OptionalDouble.empty();
        }

        double totalWeight = 0.0;
        if (attendanceRate != null) {
            totalWeight += W_PRESENCE;
        }
        if (evaluationRating != null) {
            totalWeight += W_EVALUATION;
        }
        if (punctualityScore != null) {
            totalWeight += W_PUNCTUALITY;
        }

        double presenceScore = attendanceRate != null
                ? clamp(attendanceRate)
                : 0.0;
        double evalScore = evaluationRating != null
                ? normalizedRating(evaluationRating)
                : 0.0;
        double punctualScore = punctualityScore != null
                ? clamp(punctualityScore)
                : 0.0;

        double composite = ((presenceScore * W_PRESENCE) + (evalScore * W_EVALUATION) + (punctualScore * W_PUNCTUALITY))
                / totalWeight;
        return OptionalDouble.of(clamp(composite));
    }

    public static double roundToTwoDecimals(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double clamp(double value) {
        return Math.max(0.0, Math.min(100.0, value));
    }
}
