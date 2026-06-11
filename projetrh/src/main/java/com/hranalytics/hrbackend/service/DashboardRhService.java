package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.AgeGroupDTO;
import com.hranalytics.hrbackend.dto.DashboardRhDTO;
import com.hranalytics.hrbackend.dto.DepartementEvaluationDTO;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import com.hranalytics.hrbackend.repository.DepartmentRepository;
import com.hranalytics.hrbackend.repository.EmployeeEvaluationRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class DashboardRhService {

    private static final List<String> AGE_BRACKETS = List.of("< 25", "25-34", "35-44", "45-54", "55+");

    private final EmployeeRepository employeeRepository;
    private final EmployeeEvaluationRepository employeeEvaluationRepository;
    private final DepartmentRepository departmentRepository;
    private final JdbcTemplate jdbc;

    public DashboardRhService(
            EmployeeRepository employeeRepository,
            EmployeeEvaluationRepository employeeEvaluationRepository,
            DepartmentRepository departmentRepository,
            JdbcTemplate jdbc) {
        this.employeeRepository = employeeRepository;
        this.employeeEvaluationRepository = employeeEvaluationRepository;
        this.departmentRepository = departmentRepository;
        this.jdbc = jdbc;
    }

    public DashboardRhDTO getSummary(Integer departmentId, String ageBracket, String gender, String search) {
        List<Employee> employeesMatchingGlobalFilters = employeeRepository.findAll().stream()
                .filter(employee -> matchesSearch(employee, search))
                .filter(employee -> matchesAgeBracket(employee, ageBracket))
                .filter(employee -> matchesGender(employee, gender))
                .toList();

        List<Employee> filteredEmployees = departmentId == null
                ? employeesMatchingGlobalFilters
                : employeesMatchingGlobalFilters.stream()
                        .filter(employee -> employee.getDepartment() != null
                                && departmentId.equals(employee.getDepartment().getDepartmentId()))
                        .toList();

        Map<Integer, Employee> employeeById = filteredEmployees.stream()
                .collect(Collectors.toMap(Employee::getEmployeeId, Function.identity(), (left, right) -> left));
        List<Integer> employeeIds = new ArrayList<>(employeeById.keySet());

        long effectifTotal = filteredEmployees.size();
        double ancienneteMoyenne = computeAverageSeniorityYears(filteredEmployees);
        Map<String, Long> repartitionParDepartement = computeDepartmentDistribution(employeesMatchingGlobalFilters);
        Map<String, Long> repartitionParGenre = computeGenderDistribution(filteredEmployees);
        List<AgeGroupDTO> pyramideAges = computeAgePyramid(filteredEmployees);
        List<DepartementEvaluationDTO> evaluationsParDepartement =
                computeDepartmentEvaluationAverage(employeeById, employeeIds);
        double soldeCongeMoyen = computeAverageLeaveBalance(employeeIds);

        return new DashboardRhDTO(
                effectifTotal,
                ancienneteMoyenne,
                repartitionParDepartement,
                repartitionParGenre,
                pyramideAges,
                evaluationsParDepartement,
                soldeCongeMoyen);
    }

    private double computeAverageSeniorityYears(List<Employee> employees) {
        LocalDate today = LocalDate.now();
        return employees.stream()
                .map(Employee::getHireDate)
                .filter(date -> date != null && !date.isAfter(today))
                .mapToLong(date -> ChronoUnit.YEARS.between(date, today))
                .average()
                .orElse(0.0);
    }

    private Map<String, Long> computeDepartmentDistribution(List<Employee> employees) {
        Map<String, Long> countsByName = employees.stream()
                .map(Employee::getDepartment)
                .filter(department -> department != null && department.getDepartmentName() != null)
                .collect(Collectors.groupingBy(Department::getDepartmentName, Collectors.counting()));

        LinkedHashMap<String, Long> ordered = new LinkedHashMap<>();
        departmentRepository.findAll().stream()
                .map(Department::getDepartmentName)
                .filter(name -> name != null && !name.isBlank())
                .sorted(String::compareToIgnoreCase)
                .forEach(name -> ordered.put(name, countsByName.getOrDefault(name, 0L)));
        return ordered;
    }

    private Map<String, Long> computeGenderDistribution(List<Employee> employees) {
        return employees.stream()
                .map(Employee::getGender)
                .map(this::sanitizeGender)
                .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()));
    }

    private List<AgeGroupDTO> computeAgePyramid(List<Employee> employees) {
        LocalDate today = LocalDate.now();
        Map<String, Long> counts = employees.stream()
                .map(Employee::getDateOfBirth)
                .filter(birthDate -> birthDate != null && !birthDate.isAfter(today))
                .map(birthDate -> ChronoUnit.YEARS.between(birthDate, today))
                .map(this::toAgeBracket)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));

        return AGE_BRACKETS.stream()
                .map(bracket -> new AgeGroupDTO(bracket, counts.getOrDefault(bracket, 0L)))
                .toList();
    }

    private List<DepartementEvaluationDTO> computeDepartmentEvaluationAverage(
            Map<Integer, Employee> employeeById, List<Integer> employeeIds) {
        if (employeeIds.isEmpty()) {
            return List.of();
        }

        return employeeEvaluationRepository.findByEmployeeIdIn(employeeIds).stream()
                .filter(evaluation -> evaluation.getRating() != null)
                .collect(Collectors.groupingBy(
                        evaluation -> departmentNameForEvaluation(evaluation, employeeById),
                        Collectors.averagingInt(EmployeeEvaluation::getRating)))
                .entrySet()
                .stream()
                .filter(entry -> !"N/A".equals(entry.getKey()))
                .sorted(Map.Entry.comparingByKey(String::compareToIgnoreCase))
                .map(entry -> new DepartementEvaluationDTO(entry.getKey(), entry.getValue()))
                .toList();
    }

    private double computeAverageLeaveBalance(List<Integer> employeeIds) {
        if (employeeIds.isEmpty()) {
            return 0.0;
        }
        try {
            int year = LocalDate.now().getYear();
            String placeholders = employeeIds.stream().map(id -> "?").collect(Collectors.joining(","));
            List<Object> params = new ArrayList<>(employeeIds);
            params.add(year);
            Double average = jdbc.query(
                    "SELECT AVG(GREATEST(0, COALESCE(entitled, 0) + COALESCE(carry_over, 0) "
                            + "- COALESCE(used, 0) - COALESCE(pending, 0))) AS avg_remaining "
                            + "FROM leave_balances WHERE type = 'conge-paye' "
                            + "AND employee_id IN (" + placeholders + ") AND year = ?",
                    rs -> rs.next() ? (Double) rs.getObject("avg_remaining") : null,
                    params.toArray());
            return average != null ? average : 0.0;
        } catch (Exception e) {
            return 0.0;
        }
    }

    private String sanitizeGender(String gender) {
        if (gender == null || gender.isBlank()) {
            return "Non spécifié";
        }
        String normalized = gender.trim();
        String lower = normalized.toLowerCase();
        if ("m".equals(lower) || "male".equals(lower) || "homme".equals(lower)) {
            return "H";
        }
        if ("f".equals(lower) || "female".equals(lower) || "femme".equals(lower)) {
            return "F";
        }
        return normalized;
    }

    private String toAgeBracket(Long age) {
        if (age < 25) {
            return "< 25";
        }
        if (age < 35) {
            return "25-34";
        }
        if (age < 45) {
            return "35-44";
        }
        if (age < 55) {
            return "45-54";
        }
        return "55+";
    }

    private String departmentNameForEvaluation(EmployeeEvaluation evaluation, Map<Integer, Employee> employeeById) {
        Employee employee = employeeById.get(evaluation.getEmployeeId());
        if (employee == null || employee.getDepartment() == null || employee.getDepartment().getDepartmentName() == null) {
            return "N/A";
        }
        return employee.getDepartment().getDepartmentName();
    }

    private boolean matchesAgeBracket(Employee employee, String ageBracket) {
        if (ageBracket == null || ageBracket.isBlank()) {
            return true;
        }
        if (employee.getDateOfBirth() == null || employee.getDateOfBirth().isAfter(LocalDate.now())) {
            return false;
        }
        long age = ChronoUnit.YEARS.between(employee.getDateOfBirth(), LocalDate.now());
        return toAgeBracket(age).equals(ageBracket.trim());
    }

    private boolean matchesGender(Employee employee, String gender) {
        if (gender == null || gender.isBlank()) {
            return true;
        }
        String requested = sanitizeGender(gender);
        String employeeGender = sanitizeGender(employee.getGender());
        return requested.equalsIgnoreCase(employeeGender);
    }

    private boolean matchesSearch(Employee employee, String search) {
        if (search == null || search.isBlank()) {
            return true;
        }
        String query = search.trim().toLowerCase();
        if (query.isBlank()) {
            return true;
        }
        String fullName = (safe(employee.getFirstName()) + " " + safe(employee.getLastName())).trim().toLowerCase();
        String employeeId = employee.getEmployeeId() == null ? "" : String.valueOf(employee.getEmployeeId());
        return fullName.contains(query) || employeeId.contains(query);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
