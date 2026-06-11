package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.EmployeeDTO;
import com.hranalytics.hrbackend.dto.EmployeeImportRowDTO;
import com.hranalytics.hrbackend.dto.EmployeeImportSummaryDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.entity.Department;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.DepartmentRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.util.PaginationSupport;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final DepartmentRepository departmentRepository;
    private final LeaveBalanceService leaveBalanceService;

    public EmployeeService(EmployeeRepository employeeRepository, DepartmentRepository departmentRepository, LeaveBalanceService leaveBalanceService) {
        this.employeeRepository = employeeRepository;
        this.departmentRepository = departmentRepository;
        this.leaveBalanceService = leaveBalanceService;
    }

    public List<EmployeeDTO> getAllEmployees() {
        return employeeRepository.findAll().stream().map(this::toDto).toList();
    }

    public PageResponse<EmployeeDTO> getEmployeesPage(
            int page,
            int size,
            String search,
            Integer departmentId,
            boolean unpaged
    ) {
        if (unpaged) {
            return PageResponse.unpaged(getAllEmployees());
        }
        String normalizedSearch = search == null ? "" : search.trim();
        Integer deptFilter = departmentId != null && departmentId > 0 ? departmentId : null;
        Pageable pageable = PaginationSupport.pageable(
                page,
                size,
                Sort.by("isManager").descending()
                        .and(Sort.by("lastName").ascending())
                        .and(Sort.by("firstName").ascending())
                        .and(Sort.by("employeeId").ascending())
        );
        Page<Employee> result = employeeRepository.findFiltered(normalizedSearch, deptFilter, pageable);
        return PageResponse.from(result.map(this::toDto));
    }

    public List<EmployeeDTO> getManagers() {
        return employeeRepository.findByIsManagerTrue().stream().map(this::toDto).toList();
    }

    public EmployeeDTO getEmployeeById(Integer id) {
        if (id == null) {
            throw new RuntimeException("Employee id cannot be null");
        }
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Employee not found with id: " + id));
        return toDto(employee);
    }

    public List<EmployeeDTO> searchByName(String name) {
        String safeName = name == null ? "" : name;
        return employeeRepository
                .findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(safeName, safeName)
                .stream()
                .map(this::toDto)
                .toList();
    }

    public List<EmployeeDTO> filterByDepartment(Integer deptId) {
        return employeeRepository.findByDepartment_DepartmentId(deptId).stream().map(this::toDto).toList();
    }

    @Transactional
    public EmployeeDTO updateEmployee(Integer id, EmployeeDTO payload) {
        if (id == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Employee id cannot be null");
        }
        if (payload == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Le corps de la requête est obligatoire");
        }
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Employé introuvable"));

        if (payload.getFirstName() != null) {
            employee.setFirstName(requiredUpdateText(payload.getFirstName(), "firstName"));
        }
        if (payload.getLastName() != null) {
            employee.setLastName(requiredUpdateText(payload.getLastName(), "lastName"));
        }
        if (payload.getJobTitle() != null) {
            employee.setJobTitle(requiredUpdateText(payload.getJobTitle(), "jobTitle"));
        }
        if (payload.getGender() != null) {
            employee.setGender(requiredUpdateText(payload.getGender(), "gender"));
        }
        if (payload.getMaritalStatus() != null) {
            employee.setMaritalStatus(requiredUpdateText(payload.getMaritalStatus(), "maritalStatus"));
        }
        if (payload.getHireDate() != null) {
            employee.setHireDate(payload.getHireDate());
        }
        if (payload.getDateOfBirth() != null) {
            employee.setDateOfBirth(payload.getDateOfBirth());
        }
        if (payload.getEmail() != null) {
            String email = payload.getEmail().trim();
            if (email.isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST, "email ne peut pas être vide");
            }
            if (employeeRepository.existsByEmployeeIdNotAndEmailIgnoreCase(id, email)) {
                throw new ResponseStatusException(BAD_REQUEST, "Cet email est déjà utilisé par un autre employé");
            }
            employee.setEmail(email);
        }
        if (payload.getDepartmentId() != null) {
            @SuppressWarnings("null")
            Department department = departmentRepository.findById(payload.getDepartmentId())
                    .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "Département introuvable"));
            employee.setDepartment(department);
        }
        if (payload.getManagerId() != null && payload.getManagerId().equals(id)) {
            throw new ResponseStatusException(BAD_REQUEST, "Un employé ne peut pas être son propre manager");
        }
        if (payload.getIsManager() != null) {
            employee.setIsManager(payload.getIsManager());
        }
        if (payload.getManagerId() == null) {
            employee.setManagerId(null);
        } else {
            @SuppressWarnings("null")
            boolean managerExists = employeeRepository.existsById(payload.getManagerId());
            if (!managerExists) {
                throw new ResponseStatusException(BAD_REQUEST, "Le manager fourni est introuvable");
            }
            employee.setManagerId(payload.getManagerId());
        }

        Employee saved = employeeRepository.save(employee);
        return toDto(saved);
    }

    @Transactional
    public void deleteEmployee(Integer id) {
        if (id == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Employee id cannot be null");
        }
        if (!employeeRepository.existsById(id)) {
            throw new ResponseStatusException(NOT_FOUND, "Employé introuvable");
        }

        List<Employee> subordinates = employeeRepository.findByManagerId(id);
        for (Employee subordinate : subordinates) {
            subordinate.setManagerId(null);
        }
        if (!subordinates.isEmpty()) {
            employeeRepository.saveAll(subordinates);
        }

        try {
            employeeRepository.deleteById(id);
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "Suppression impossible: cet employé est encore référencé par d'autres données métier",
                    exception
            );
        }
    }

    @Transactional
    public EmployeeImportSummaryDTO importExcel(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Le fichier Excel est vide");
        }

        String filename = file.getOriginalFilename();
        if (filename == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Nom de fichier invalide");
        }
        String normalizedFilename = filename.toLowerCase(Locale.ROOT);
        boolean isXlsx = normalizedFilename.endsWith(".xlsx");
        boolean isCsv = normalizedFilename.endsWith(".csv");
        if (!isXlsx && !isCsv) {
            throw new ResponseStatusException(BAD_REQUEST, "Seuls les fichiers .xlsx ou .csv sont acceptés");
        }

        if (isCsv) {
            try (InputStream inputStream = file.getInputStream()) {
                List<EmployeeImportRowDTO> rows = parseCsvRows(inputStream);
                if (rows.isEmpty()) {
                    throw new ResponseStatusException(BAD_REQUEST, "Le fichier ne contient aucune ligne de données");
                }
                return importRows(rows);
            } catch (IOException exception) {
                throw new ResponseStatusException(BAD_REQUEST, "Impossible de lire le fichier CSV", exception);
            }
        }

        try (InputStream inputStream = file.getInputStream(); Workbook workbook = WorkbookFactory.create(inputStream)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() < 2) {
                throw new ResponseStatusException(BAD_REQUEST, "Le fichier ne contient aucune ligne de données");
            }

            Row headerRow = sheet.getRow(0);
            Map<String, Integer> headers = indexHeaders(headerRow);

            Integer firstNameIndex = requireHeader(headers, "first_name", "firstName", "prenom", "prénom");
            Integer lastNameIndex = requireHeader(headers, "last_name", "lastName", "nom");
            Integer emailIndex = requireHeader(headers, "email");
            Integer genderIndex = requireHeader(headers, "gender", "sexe");
            Integer dateOfBirthIndex = requireHeader(headers, "date_of_birth", "dateOfBirth", "date_naissance");
            Integer maritalStatusIndex = requireHeader(headers, "marital_status", "maritalStatus", "statut_marital");
            Integer departmentIdIndex = requireHeader(headers, "department_id", "departmentId");
            Integer departmentNameIndex = resolveHeaderIndex(headers, "department_name", "departmentName", "departement", "département");
            Integer jobTitleIndex = requireHeader(headers, "job_title", "jobTitle", "poste");
            Integer hireDateIndex = requireHeader(headers, "hire_date", "hireDate", "date_embauche");
            Integer managerIdIndex = resolveHeaderIndex(headers, "manager_id", "managerId");

            List<EmployeeImportRowDTO> rows = new ArrayList<>();

            Iterator<Row> rowIterator = sheet.rowIterator();
            if (rowIterator.hasNext()) {
                rowIterator.next();
            }

            while (rowIterator.hasNext()) {
                Row row = rowIterator.next();
                int rowIndex = row.getRowNum();
                if (row == null || isEmptyRow(row)) {
                    continue;
                }

                EmployeeImportRowDTO item = new EmployeeImportRowDTO();
                item.setFirstName(parseRequiredStringCell(row.getCell(firstNameIndex), "first_name", rowIndex));
                item.setLastName(parseRequiredStringCell(row.getCell(lastNameIndex), "last_name", rowIndex));
                item.setEmail(parseRequiredStringCell(row.getCell(emailIndex), "email", rowIndex));
                item.setGender(parseRequiredStringCell(row.getCell(genderIndex), "gender", rowIndex));
                item.setDateOfBirth(parseRequiredDateCell(row.getCell(dateOfBirthIndex), "date_of_birth", rowIndex).toString());
                item.setMaritalStatus(parseRequiredStringCell(row.getCell(maritalStatusIndex), "marital_status", rowIndex));
                item.setDepartmentId(parseRequiredIntegerCell(row.getCell(departmentIdIndex), "department_id", rowIndex));
                item.setDepartmentName(departmentNameIndex == null ? null : parseOptionalStringCell(row.getCell(departmentNameIndex)));
                item.setJobTitle(parseRequiredStringCell(row.getCell(jobTitleIndex), "job_title", rowIndex));
                item.setHireDate(parseRequiredDateCell(row.getCell(hireDateIndex), "hire_date", rowIndex).toString());
                item.setManagerId(
                        managerIdIndex == null
                                ? null
                                : parseOptionalIntegerCell(row.getCell(managerIdIndex), "manager_id", rowIndex)
                );
                rows.add(item);
            }

            if (rows.isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST, "Aucune ligne exploitable trouvée dans le fichier");
            }

            return importRows(rows);
        } catch (IOException exception) {
            throw new ResponseStatusException(BAD_REQUEST, "Impossible de lire le fichier Excel", exception);
        }
    }

    private List<EmployeeImportRowDTO> parseCsvRows(InputStream inputStream) throws IOException {
        List<EmployeeImportRowDTO> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            String headerLine = null;
            while ((line = reader.readLine()) != null) {
                if (line != null && !line.trim().isEmpty()) {
                    headerLine = line;
                    break;
                }
            }
            if (headerLine == null) {
                return rows;
            }

            List<String> headersRaw = parseCsvLine(headerLine);
            Map<String, Integer> headers = new HashMap<>();
            for (int i = 0; i < headersRaw.size(); i += 1) {
                headers.put(normalizeHeader(headersRaw.get(i).replace("\uFEFF", "")), i);
            }

            Integer firstNameIndex = requireHeader(headers, "first_name", "firstName", "prenom", "prénom");
            Integer lastNameIndex = requireHeader(headers, "last_name", "lastName", "nom");
            Integer emailIndex = requireHeader(headers, "email");
            Integer genderIndex = requireHeader(headers, "gender", "sexe");
            Integer dateOfBirthIndex = requireHeader(headers, "date_of_birth", "dateOfBirth", "date_naissance");
            Integer maritalStatusIndex = requireHeader(headers, "marital_status", "maritalStatus", "statut_marital");
            Integer departmentIdIndex = requireHeader(headers, "department_id", "departmentId");
            Integer departmentNameIndex = resolveHeaderIndex(headers, "department_name", "departmentName", "departement", "département");
            Integer jobTitleIndex = requireHeader(headers, "job_title", "jobTitle", "poste");
            Integer hireDateIndex = requireHeader(headers, "hire_date", "hireDate", "date_embauche");
            Integer managerIdIndex = resolveHeaderIndex(headers, "manager_id", "managerId");

            int rowIndex = 1;
            while ((line = reader.readLine()) != null) {
                rowIndex += 1;
                if (line.trim().isEmpty()) {
                    continue;
                }
                List<String> values = parseCsvLine(line);
                EmployeeImportRowDTO item = new EmployeeImportRowDTO();
                item.setFirstName(requiredText(csvValue(values, firstNameIndex), "first_name", rowIndex));
                item.setLastName(requiredText(csvValue(values, lastNameIndex), "last_name", rowIndex));
                item.setEmail(requiredText(csvValue(values, emailIndex), "email", rowIndex));
                item.setGender(requiredText(csvValue(values, genderIndex), "gender", rowIndex));
                item.setDateOfBirth(requiredText(csvValue(values, dateOfBirthIndex), "date_of_birth", rowIndex));
                item.setMaritalStatus(requiredText(csvValue(values, maritalStatusIndex), "marital_status", rowIndex));
                item.setDepartmentId(parseRequiredIntegerText(csvValue(values, departmentIdIndex), "department_id", rowIndex));
                item.setDepartmentName(departmentNameIndex == null ? null : csvValue(values, departmentNameIndex));
                item.setJobTitle(requiredText(csvValue(values, jobTitleIndex), "job_title", rowIndex));
                item.setHireDate(requiredText(csvValue(values, hireDateIndex), "hire_date", rowIndex));
                item.setManagerId(
                        managerIdIndex == null
                                ? null
                                : parseOptionalIntegerText(csvValue(values, managerIdIndex), "manager_id", rowIndex)
                );
                rows.add(item);
            }
        }
        return rows;
    }

    private String csvValue(List<String> values, int index) {
        if (index < 0 || index >= values.size()) {
            return "";
        }
        return values.get(index).trim();
    }

    private List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < line.length(); i += 1) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (ch == ',' && !inQuotes) {
                values.add(current.toString());
                current.setLength(0);
                continue;
            }
            current.append(ch);
        }
        values.add(current.toString());
        return values;
    }

    private Integer parseOptionalIntegerText(String value, String column, int rowIndex) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException exception) {
            throw invalidCell(column, rowIndex, "doit être un entier");
        }
    }

    private Integer parseRequiredIntegerText(String value, String column, int rowIndex) {
        Integer parsed = parseOptionalIntegerText(value, column, rowIndex);
        if (parsed == null) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return parsed;
    }

    @Transactional
    public EmployeeImportSummaryDTO importRows(List<EmployeeImportRowDTO> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Aucune ligne à importer");
        }
        Map<Integer, Department> departmentsById = new HashMap<>();
        for (Department department : departmentRepository.findAll()) {
            if (department.getDepartmentId() != null) {
                departmentsById.put(department.getDepartmentId(), department);
            }
        }

        int nextEmployeeId = employeeRepository.findMaxEmployeeId() + 1;
        List<Integer> importedEmployeeIds = new ArrayList<>();
        Set<Integer> referencableEmployeeIds = new HashSet<>(
                employeeRepository.findAll().stream().map(Employee::getEmployeeId).toList()
        );

        Set<String> emailsSeenInBatch = new HashSet<>();
        for (int i = 0; i < rows.size(); i += 1) {
            EmployeeImportRowDTO r = rows.get(i);
            int rowIndex = i + 1;
            String emailRaw = requiredText(r.getEmail(), "email", rowIndex);
            String emailKey = emailKey(emailRaw);
            if (!emailsSeenInBatch.add(emailKey)) {
                throw new ResponseStatusException(
                        BAD_REQUEST,
                        "Ligne " + rowIndex + ", colonne 'email': adresse dupliquée dans le fichier (chaque employé doit avoir un email unique)"
                );
            }
        }

        for (int i = 0; i < rows.size(); i += 1) {
            EmployeeImportRowDTO row = rows.get(i);
            int rowIndex = i + 1;

            String firstName = requiredText(row.getFirstName(), "first_name", rowIndex);
            String lastName = requiredText(row.getLastName(), "last_name", rowIndex);
            String email = requiredText(row.getEmail(), "email", rowIndex);
            if (employeeRepository.existsByEmailIgnoreCase(email)) {
                throw invalidCell("email", rowIndex, "cet email est déjà utilisé par un employé en base");
            }
            String gender = requiredText(row.getGender(), "gender", rowIndex);
            String maritalStatus = requiredText(row.getMaritalStatus(), "marital_status", rowIndex);
            String jobTitle = requiredText(row.getJobTitle(), "job_title", rowIndex);
            Integer departmentId = requiredInteger(row.getDepartmentId(), "department_id", rowIndex);
            Integer managerId = normalizeManagerId(row.getManagerId(), rowIndex);
            LocalDate dateOfBirth = parseRequiredDateText(row.getDateOfBirth(), "date_of_birth", rowIndex);
            LocalDate hireDate = parseRequiredDateText(row.getHireDate(), "hire_date", rowIndex);

            Department department = departmentsById.get(departmentId);
            if (department == null) {
                throw invalidCell("department_id", rowIndex, "département introuvable");
            }

            if (managerId != null) {
                if (!referencableEmployeeIds.contains(managerId)) {
                    throw invalidCell(
                            "manager_id",
                            rowIndex,
                            "référence un employé inexistant. Mettez une valeur vide pour un manager racine, "
                                    + "importez les managers en premier (ou plus haut dans le fichier), ou utilisez un id déjà en base."
                    );
                }
            }

            Employee employee = new Employee();
            employee.setEmployeeId(nextEmployeeId);
            employee.setFirstName(firstName);
            employee.setLastName(lastName);
            employee.setEmail(email);
            employee.setGender(gender);
            employee.setDateOfBirth(dateOfBirth);
            employee.setMaritalStatus(maritalStatus);
            employee.setDepartment(department);
            employee.setJobTitle(jobTitle);
            employee.setHireDate(hireDate);
            employee.setManagerId(managerId);
            employeeRepository.save(employee);
            leaveBalanceService.initializeForEmployee(nextEmployeeId);

            importedEmployeeIds.add(nextEmployeeId);
            referencableEmployeeIds.add(nextEmployeeId);
            nextEmployeeId += 1;
        }

        return new EmployeeImportSummaryDTO(rows.size(), rows.size(), importedEmployeeIds);
    }

    private EmployeeDTO toDto(Employee employee) {
        EmployeeDTO dto = new EmployeeDTO();
        dto.setEmployeeId(employee.getEmployeeId());
        dto.setFirstName(employee.getFirstName());
        dto.setLastName(employee.getLastName());
        dto.setEmail(employee.getEmail());
        dto.setGender(employee.getGender());
        dto.setDateOfBirth(employee.getDateOfBirth());
        dto.setMaritalStatus(employee.getMaritalStatus());
        dto.setJobTitle(employee.getJobTitle());
        dto.setHireDate(employee.getHireDate());
        dto.setManagerId(employee.getManagerId());
        dto.setIsManager(employee.getIsManager() != null && employee.getIsManager());

        Department department = employee.getDepartment();
        if (department != null) {
            dto.setDepartmentId(department.getDepartmentId());
            dto.setDepartmentName(department.getDepartmentName());
        }

        return dto;
    }

    private Map<String, Integer> indexHeaders(Row headerRow) {
        Map<String, Integer> headers = new HashMap<>();
        if (headerRow == null) {
            return headers;
        }
        for (Cell cell : headerRow) {
            if (cell == null) {
                continue;
            }
            String raw = cell.toString();
            if (raw == null || raw.trim().isEmpty()) {
                continue;
            }
            headers.put(normalizeHeader(raw), cell.getColumnIndex());
        }
        return headers;
    }

    private Integer resolveHeaderIndex(Map<String, Integer> headers, String... aliases) {
        for (String alias : aliases) {
            Integer index = headers.get(normalizeHeader(alias));
            if (index != null) {
                return index;
            }
        }
        return null;
    }

    private Integer requireHeader(Map<String, Integer> headers, String... aliases) {
        Integer index = resolveHeaderIndex(headers, aliases);
        if (index != null) {
            return index;
        }
        throw new ResponseStatusException(
                BAD_REQUEST,
                "Colonnes obligatoires manquantes. Vérifiez le template complet (toutes les colonnes sont requises)."
        );
    }

    private String normalizeHeader(String raw) {
        return raw.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\s\\-]+", "_");
    }

    private String emailKey(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private boolean isEmptyRow(Row row) {
        for (Cell cell : row) {
            if (cell != null && cell.getCellType() != CellType.BLANK && !cell.toString().trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private String parseRequiredStringCell(Cell cell, String column, int rowIndex) {
        String value = parseOptionalStringCell(cell);
        if (value == null || value.isEmpty()) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return value;
    }

    private String parseOptionalStringCell(Cell cell) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return null;
        }
        String value = cell.toString().trim();
        return value.isEmpty() ? null : value;
    }

    private Integer parseOptionalIntegerCell(Cell cell, String column, int rowIndex) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return null;
        }
        try {
            if (cell.getCellType() == CellType.NUMERIC) {
                return (int) Math.round(cell.getNumericCellValue());
            }
            String value = cell.toString().trim();
            if (value.isEmpty()) {
                return null;
            }
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            throw invalidCell(column, rowIndex, "doit être un entier");
        }
    }

    private Integer parseRequiredIntegerCell(Cell cell, String column, int rowIndex) {
        Integer value = parseOptionalIntegerCell(cell, column, rowIndex);
        if (value == null) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return value;
    }

    private LocalDate parseOptionalDateCell(Cell cell, String column, int rowIndex) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return null;
        }
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getDateCellValue().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        String value = cell.toString().trim();
        if (value.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw invalidCell(column, rowIndex, "format attendu YYYY-MM-DD");
        }
    }

    private LocalDate parseRequiredDateCell(Cell cell, String column, int rowIndex) {
        LocalDate value = parseOptionalDateCell(cell, column, rowIndex);
        if (value == null) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return value;
    }

    private String requiredText(String value, String column, int rowIndex) {
        if (value == null || value.trim().isEmpty()) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return value.trim();
    }

    private String requiredUpdateText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, field + " est obligatoire");
        }
        return value.trim();
    }

    private Integer requiredInteger(Integer value, String column, int rowIndex) {
        if (value == null) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        return value;
    }

    private LocalDate parseRequiredDateText(String value, String column, int rowIndex) {
        if (value == null || value.trim().isEmpty()) {
            throw invalidCell(column, rowIndex, "valeur obligatoire");
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException exception) {
            throw invalidCell(column, rowIndex, "format attendu YYYY-MM-DD");
        }
    }

    /** Vide ou absent en Excel / JSON => pas de N+1 (manager racine). Sinon id strictement positif. */
    private Integer normalizeManagerId(Integer managerId, int rowIndex) {
        if (managerId == null) {
            return null;
        }
        if (managerId <= 0) {
            throw invalidCell("manager_id", rowIndex, "doit être un entier strictement positif ou vide");
        }
        return managerId;
    }

    private ResponseStatusException invalidCell(String column, int rowIndex, String message) {
        return new ResponseStatusException(
                BAD_REQUEST,
                "Ligne " + (rowIndex + 1) + ", colonne '" + column + "': " + message
        );
    }
}
