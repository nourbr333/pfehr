package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.DepartmentPerformanceAggregateDTO;
import com.hranalytics.hrbackend.dto.EmployeePerformanceScoreDTO;
import com.hranalytics.hrbackend.entity.Attendance;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import com.hranalytics.hrbackend.repository.AttendanceRepository;
import com.hranalytics.hrbackend.repository.EmployeeEvaluationRepository;
import com.hranalytics.hrbackend.util.PerformanceScoreCalculator;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.OptionalDouble;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class PerformanceScoreService {

    private final AttendanceRepository attendanceRepository;
    private final EmployeeEvaluationRepository employeeEvaluationRepository;

    public PerformanceScoreService(
            AttendanceRepository attendanceRepository,
            EmployeeEvaluationRepository employeeEvaluationRepository) {
        this.attendanceRepository = attendanceRepository;
        this.employeeEvaluationRepository = employeeEvaluationRepository;
    }

    public List<EmployeePerformanceScoreDTO> getPerformanceScores(Collection<Integer> employeeIds) {
        Map<Integer, Double> scores = computeScores(employeeIds, LocalDate.now());
        return scores.entrySet().stream()
                .map(entry -> new EmployeePerformanceScoreDTO(entry.getKey(), entry.getValue()))
                .toList();
    }

    public DepartmentPerformanceAggregateDTO aggregateForEmployees(Collection<Integer> employeeIds) {
        List<Integer> ids = normalizeIds(employeeIds);
        if (ids.isEmpty()) {
            return new DepartmentPerformanceAggregateDTO(0.0, 0.0, 0);
        }

        LocalDate referenceDate = LocalDate.now();
        Map<Integer, List<Attendance>> attendanceByEmployeeId = groupAttendanceByEmployee(ids);
        Map<Integer, List<EmployeeEvaluation>> evaluationsByEmployeeId = groupEvaluationsByEmployee(ids);

        List<Double> performanceScores = new ArrayList<>();
        List<Double> attendanceRates = new ArrayList<>();
        int evaluatedEmployees = 0;

        for (Integer employeeId : ids) {
            List<Attendance> monthAttendance = PerformanceScoreCalculator.filterAttendanceForMonth(
                    attendanceByEmployeeId.getOrDefault(employeeId, List.of()), referenceDate);
            List<EmployeeEvaluation> monthEvaluations = PerformanceScoreCalculator.filterEvaluationsForMonth(
                    evaluationsByEmployeeId.getOrDefault(employeeId, List.of()), referenceDate);

            Double attendanceRate = PerformanceScoreCalculator.attendanceRate(monthAttendance);
            Double punctualityScore = PerformanceScoreCalculator.punctualityScore(monthAttendance);
            Integer evaluationRating = PerformanceScoreCalculator.latestEvaluationInMonth(monthEvaluations, referenceDate)
                    .map(EmployeeEvaluation::getRating)
                    .orElse(null);

            if (evaluationRating != null) {
                evaluatedEmployees += 1;
            }
            if (attendanceRate != null) {
                attendanceRates.add(attendanceRate);
            }

            OptionalDouble composite = PerformanceScoreCalculator.computeComposite(
                    attendanceRate, evaluationRating, punctualityScore);
            composite.ifPresent(performanceScores::add);
        }

        double averagePerformance = performanceScores.stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);
        double averageAttendance = attendanceRates.stream()
                .mapToDouble(Double::doubleValue)
                .average()
                .orElse(0.0);

        return new DepartmentPerformanceAggregateDTO(
                PerformanceScoreCalculator.roundToTwoDecimals(averagePerformance),
                PerformanceScoreCalculator.roundToTwoDecimals(averageAttendance),
                evaluatedEmployees);
    }

    private Map<Integer, Double> computeScores(Collection<Integer> employeeIds, LocalDate referenceDate) {
        List<Integer> ids = normalizeIds(employeeIds);
        Map<Integer, Double> scores = new HashMap<>();
        if (ids.isEmpty()) {
            return scores;
        }

        Map<Integer, List<Attendance>> attendanceByEmployeeId = groupAttendanceByEmployee(ids);
        Map<Integer, List<EmployeeEvaluation>> evaluationsByEmployeeId = groupEvaluationsByEmployee(ids);

        for (Integer employeeId : ids) {
            List<Attendance> monthAttendance = PerformanceScoreCalculator.filterAttendanceForMonth(
                    attendanceByEmployeeId.getOrDefault(employeeId, List.of()), referenceDate);
            List<EmployeeEvaluation> monthEvaluations = PerformanceScoreCalculator.filterEvaluationsForMonth(
                    evaluationsByEmployeeId.getOrDefault(employeeId, List.of()), referenceDate);

            Double attendanceRate = PerformanceScoreCalculator.attendanceRate(monthAttendance);
            Double punctualityScore = PerformanceScoreCalculator.punctualityScore(monthAttendance);
            Integer evaluationRating = PerformanceScoreCalculator.latestEvaluationInMonth(monthEvaluations, referenceDate)
                    .map(EmployeeEvaluation::getRating)
                    .orElse(null);

            OptionalDouble composite = PerformanceScoreCalculator.computeComposite(
                    attendanceRate, evaluationRating, punctualityScore);
            composite.ifPresent(value -> scores.put(employeeId, PerformanceScoreCalculator.roundToTwoDecimals(value)));
        }

        return scores;
    }

    private Map<Integer, List<Attendance>> groupAttendanceByEmployee(List<Integer> employeeIds) {
        return attendanceRepository.findByEmployeeIdIn(employeeIds).stream()
                .collect(Collectors.groupingBy(Attendance::getEmployeeId));
    }

    private Map<Integer, List<EmployeeEvaluation>> groupEvaluationsByEmployee(List<Integer> employeeIds) {
        return employeeEvaluationRepository.findByEmployeeIdIn(employeeIds).stream()
                .collect(Collectors.groupingBy(EmployeeEvaluation::getEmployeeId));
    }

    private List<Integer> normalizeIds(Collection<Integer> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) {
            return List.of();
        }
        return employeeIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }
}
