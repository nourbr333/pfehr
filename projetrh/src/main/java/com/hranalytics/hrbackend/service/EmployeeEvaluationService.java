package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.EmployeeEvaluationDTO;
import com.hranalytics.hrbackend.dto.EvaluationImportRowDTO;
import com.hranalytics.hrbackend.dto.EvaluationImportSummaryDTO;
import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import com.hranalytics.hrbackend.repository.EmployeeEvaluationRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class EmployeeEvaluationService {

    private final EmployeeEvaluationRepository evaluationRepository;
    private final EmployeeRepository employeeRepository;

    public EmployeeEvaluationService(
            EmployeeEvaluationRepository evaluationRepository, EmployeeRepository employeeRepository) {
        this.evaluationRepository = evaluationRepository;
        this.employeeRepository = employeeRepository;
    }

    public List<EmployeeEvaluationDTO> findByEmployeeId(Integer employeeId) {
        return evaluationRepository
                .findAllByEmployeeIdNewestFirst(employeeId)
                .stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public EvaluationImportSummaryDTO importExcelForManager(Integer managerId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fichier Excel manquant.");
        }
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase(Locale.ROOT) : "";
        if (!filename.endsWith(".xlsx")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seuls les fichiers .xlsx sont acceptés.");
        }

        List<ParsedEvaluationRow> parsedRows = parseExcelRows(file);
        return persistImportedRows(managerId, parsedRows);
    }

    @Transactional
    public EvaluationImportSummaryDTO importRowsForManager(Integer managerId, List<EvaluationImportRowDTO> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune ligne à importer.");
        }

        List<ParsedEvaluationRow> parsedRows = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            EvaluationImportRowDTO row = rows.get(i);
            if (row == null || row.getEmployeeId() == null || row.getRating() == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Ligne " + (i + 1) + " : ID employé et score (0-100) sont obligatoires.");
            }
            if (row.getRating() < 0 || row.getRating() > 100) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Ligne " + (i + 1) + " : le score doit être compris entre 0 et 100.");
            }

            ParsedEvaluationRow parsed = new ParsedEvaluationRow();
            parsed.employeeId = row.getEmployeeId();
            parsed.period = clean(row.getPeriod());
            parsed.objectifs = clean(row.getObjectifs());
            parsed.comments = clean(row.getComments());
            parsed.rating = row.getRating();
            parsed.evaluatedAt = parseOptionalIsoDate(row.getEvaluatedAt(), i + 1);
            parsedRows.add(parsed);
        }

        return persistImportedRows(managerId, parsedRows);
    }

    private EvaluationImportSummaryDTO persistImportedRows(Integer managerId, List<ParsedEvaluationRow> parsedRows) {
        if (parsedRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Aucune ligne exploitable trouvée dans le fichier.");
        }

        Set<Integer> skippedIds = new HashSet<>();
        Set<Integer> importedEmployeeIds = new HashSet<>();
        int importedRows = 0;

        for (ParsedEvaluationRow row : parsedRows) {
            if (!employeeRepository.existsByEmployeeIdAndManagerId(row.employeeId, managerId)) {
                skippedIds.add(row.employeeId);
                continue;
            }

            EmployeeEvaluationDTO payload = new EmployeeEvaluationDTO();
            payload.setManagerId(managerId);
            payload.setEvaluatedAt(row.evaluatedAt != null ? row.evaluatedAt : LocalDate.now());
            payload.setPeriod(row.period);
            payload.setObjectifs(row.objectifs);
            payload.setComments(row.comments);
            payload.setRating(row.rating);
            createForEmployee(row.employeeId, payload);
            importedEmployeeIds.add(row.employeeId);
            importedRows++;
        }

        if (importedRows == 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Aucune évaluation importée. Vérifiez les ID employé (membres de votre équipe uniquement)."
                            + (skippedIds.isEmpty() ? "" : " IDs ignorés : " + skippedIds.stream().sorted().toList()));
        }

        return new EvaluationImportSummaryDTO(
                importedRows,
                importedEmployeeIds.size(),
                importedEmployeeIds.stream().sorted().toList(),
                skippedIds.stream().sorted().toList());
    }

    private LocalDate parseOptionalIsoDate(String raw, int rowIndex) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException exception) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Ligne " + rowIndex + " : date d'évaluation invalide (format AAAA-MM-JJ).");
        }
    }

    private List<ParsedEvaluationRow> parseExcelRows(MultipartFile file) {
        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getNumberOfSheets() > 0 ? workbook.getSheetAt(0) : null;
            if (sheet == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le fichier Excel est vide.");
            }

            Row headerRow = sheet.getRow(0);
            Map<String, Integer> headers = indexHeaders(headerRow);

            Integer employeeIdIndex = resolveHeaderIndex(headers, "id employe", "id employé", "employee_id", "employee id");
            Integer periodIndex = resolveHeaderIndex(headers, "periode", "période", "period");
            Integer scoreIndex = resolveHeaderIndex(headers, "score (0-100)", "score", "note", "rating");
            Integer objectifsIndex = resolveHeaderIndex(headers, "objectifs", "objectif");
            Integer commentsIndex = resolveHeaderIndex(headers, "commentaires", "comments", "commentaire");
            Integer dateIndex = resolveHeaderIndex(headers, "date evaluation", "date évaluation", "evaluated_at", "date");

            if (employeeIdIndex == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Colonne obligatoire manquante : « ID employé ».");
            }
            if (scoreIndex == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Colonne obligatoire manquante : « Score (0-100) ».");
            }

            List<ParsedEvaluationRow> rows = new ArrayList<>();
            Iterator<Row> iterator = sheet.rowIterator();
            if (iterator.hasNext()) {
                iterator.next();
            }

            while (iterator.hasNext()) {
                Row row = iterator.next();
                if (row == null || isEmptyRow(row)) {
                    continue;
                }
                int rowIndex = row.getRowNum();
                ParsedEvaluationRow parsed = new ParsedEvaluationRow();
                parsed.employeeId = parseIntegerCell(row.getCell(employeeIdIndex), "ID employé", rowIndex);
                parsed.period = parseOptionalString(row.getCell(periodIndex));
                parsed.rating = parseScoreCell(row.getCell(scoreIndex), rowIndex);
                parsed.objectifs = parseOptionalString(row.getCell(objectifsIndex));
                parsed.comments = parseOptionalString(row.getCell(commentsIndex));
                parsed.evaluatedAt = parseOptionalDateCell(row.getCell(dateIndex), rowIndex);
                rows.add(parsed);
            }
            return rows;
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Impossible de lire le fichier Excel.", exception);
        }
    }

    public EmployeeEvaluationDTO createForEmployee(Integer employeeId, EmployeeEvaluationDTO payload) {
        if (payload == null || payload.getManagerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le manager est obligatoire.");
        }
        Integer managerId = payload.getManagerId();
        if (payload.getRating() != null && (payload.getRating() < 0 || payload.getRating() > 100)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La note doit etre comprise entre 0 et 100.");
        }
        EmployeeEvaluation evaluation = new EmployeeEvaluation();
        evaluation.setEmployeeId(employeeId);
        evaluation.setManagerId(managerId);
        evaluation.setEvaluatedAt(payload.getEvaluatedAt() != null ? payload.getEvaluatedAt() : LocalDate.now());
        evaluation.setPeriod(clean(payload.getPeriod()));
        evaluation.setObjectif(clean(resolveObjectifs(payload)));
        evaluation.setComments(clean(payload.getComments()));
        evaluation.setRating(payload.getRating());

        return toDto(evaluationRepository.save(evaluation));
    }

    public EmployeeEvaluationDTO updateForEmployee(Integer employeeId, Integer evaluationId, EmployeeEvaluationDTO payload) {
        if (payload == null || payload.getManagerId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le manager est obligatoire.");
        }
        if (payload.getRating() != null && (payload.getRating() < 0 || payload.getRating() > 100)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La note doit etre comprise entre 0 et 100.");
        }
        EmployeeEvaluation evaluation =
                evaluationRepository
                        .findByEvaluationIdAndEmployeeId(evaluationId, employeeId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evaluation introuvable."));

        evaluation.setManagerId(payload.getManagerId());
        if (payload.getEvaluatedAt() != null) evaluation.setEvaluatedAt(payload.getEvaluatedAt());
        evaluation.setPeriod(clean(payload.getPeriod()));
        evaluation.setObjectif(clean(resolveObjectifs(payload)));
        evaluation.setComments(clean(payload.getComments()));
        evaluation.setRating(payload.getRating());

        return toDto(evaluationRepository.save(evaluation));
    }

    @SuppressWarnings("null")
    public void deleteForEmployee(Integer employeeId, Integer evaluationId) {
        EmployeeEvaluation evaluation =
                evaluationRepository
                        .findByEvaluationIdAndEmployeeId(evaluationId, employeeId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Evaluation introuvable."));

        @SuppressWarnings("null")
        EmployeeEvaluation toDelete = evaluation;
        evaluationRepository.delete(toDelete);
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
            String normalized = normalizeHeader(cell.toString());
            if (!normalized.isEmpty()) {
                headers.put(normalized, cell.getColumnIndex());
            }
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

    private String normalizeHeader(String value) {
        if (value == null) {
            return "";
        }
        return value
                .trim()
                .toLowerCase(Locale.ROOT)
                .replace('é', 'e')
                .replace('è', 'e')
                .replace('ê', 'e')
                .replace('à', 'a')
                .replace('ù', 'u')
                .replace('ô', 'o')
                .replace('(', ' ')
                .replace(')', ' ')
                .replaceAll("\\s+", " ")
                .trim();
    }

    private boolean isEmptyRow(Row row) {
        for (Cell cell : row) {
            if (cell != null && cell.getCellType() != CellType.BLANK && !cell.toString().trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private Integer parseIntegerCell(Cell cell, String column, int rowIndex) {
        if (cell == null) {
            throw invalidCell(column, rowIndex, "valeur manquante");
        }
        try {
            if (cell.getCellType() == CellType.NUMERIC) {
                return (int) Math.round(cell.getNumericCellValue());
            }
            String value = cell.toString().trim();
            if (value.isEmpty()) {
                throw invalidCell(column, rowIndex, "valeur vide");
            }
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            throw invalidCell(column, rowIndex, "doit être un entier");
        }
    }

    private Integer parseScoreCell(Cell cell, int rowIndex) {
        Integer score = parseIntegerCell(cell, "Score (0-100)", rowIndex);
        if (score < 0 || score > 100) {
            throw invalidCell("Score (0-100)", rowIndex, "doit être compris entre 0 et 100");
        }
        return score;
    }

    private LocalDate parseOptionalDateCell(Cell cell, int rowIndex) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return null;
        }
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getDateCellValue().toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
        }
        String value = cell.toString().trim();
        if (value.isEmpty()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw invalidCell("Date évaluation", rowIndex, "format attendu AAAA-MM-JJ");
        }
    }

    private String parseOptionalString(Cell cell) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return null;
        }
        String value = cell.toString().trim();
        return value.isEmpty() ? null : value;
    }

    private ResponseStatusException invalidCell(String column, int rowIndex, String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Ligne " + (rowIndex + 1) + ", colonne '" + column + "' : " + message);
    }

    private EmployeeEvaluationDTO toDto(EmployeeEvaluation e) {
        EmployeeEvaluationDTO dto = new EmployeeEvaluationDTO();
        dto.setEvaluationId(e.getEvaluationId());
        dto.setEmployeeId(e.getEmployeeId());
        dto.setManagerId(e.getManagerId());
        dto.setEvaluatedAt(e.getEvaluatedAt());
        dto.setPeriod(e.getPeriod());
        dto.setObjectifs(e.getObjectif());
        dto.setSummary(e.getObjectif());
        dto.setComments(e.getComments());
        dto.setRating(e.getRating());
        return dto;
    }

    private String resolveObjectifs(EmployeeEvaluationDTO payload) {
        if (payload.getObjectifs() != null && !payload.getObjectifs().isBlank()) {
            return payload.getObjectifs();
        }
        return payload.getSummary();
    }

    private String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static class ParsedEvaluationRow {
        Integer employeeId;
        String period;
        Integer rating;
        String objectifs;
        String comments;
        LocalDate evaluatedAt;
    }
}
