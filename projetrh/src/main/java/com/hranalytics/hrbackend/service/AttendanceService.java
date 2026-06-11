package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.AttendanceDTO;
import com.hranalytics.hrbackend.dto.AttendanceImportSummaryDTO;
import com.hranalytics.hrbackend.dto.AttendanceManualUpdateRequest;
import com.hranalytics.hrbackend.dto.AttendancePendingRowDTO;
import com.hranalytics.hrbackend.dto.AttendancePreviewResultDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.entity.Attendance;
import com.hranalytics.hrbackend.repository.AttendanceRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import com.hranalytics.hrbackend.util.PaginationSupport;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final EmployeeRepository employeeRepository;

    public AttendanceService(AttendanceRepository attendanceRepository, EmployeeRepository employeeRepository) {
        this.attendanceRepository = attendanceRepository;
        this.employeeRepository = employeeRepository;
    }

    public AttendanceDTO findByEmployeeIdOrDefault(Integer employeeId) {
        if (employeeId == null) {
            return defaultDto(null);
        }
        return attendanceRepository.findLatestByEmployeeId(employeeId)
                .map(this::toDto)
                .orElseGet(() -> defaultDto(employeeId));
    }

    public List<AttendanceDTO> findAll() {
        return attendanceRepository.findAll().stream()
                .sorted(Comparator.comparing(Attendance::getEmployeeId)
                        .thenComparing(Attendance::getAttendanceDate))
                .map(this::toDto)
                .toList();
    }

    public PageResponse<AttendanceDTO> findAllPage(int page, int size, boolean unpaged) {
        if (unpaged) {
            return PageResponse.unpaged(findAll());
        }
        Page<Attendance> result = attendanceRepository.findAllByOrderByEmployeeIdAscAttendanceDateAsc(
                PaginationSupport.pageable(page, size)
        );
        return PageResponse.from(result.map(this::toDto));
    }

    @Transactional
    public AttendanceDTO upsertManual(Integer employeeId, AttendanceManualUpdateRequest request) {
        LocalDate date = request.getAttendanceDate();
        Attendance attendance = attendanceRepository
                .findByEmployeeIdAndAttendanceDate(employeeId, date)
                .orElseGet(() -> {
                    Attendance created = new Attendance();
                    created.setEmployeeId(employeeId);
                    created.setAttendanceDate(date);
                    return created;
                });
        attendance.setIsPresent(request.getIsPresent() != null && request.getIsPresent());
        attendance.setIsLate(request.getIsLate() != null && request.getIsLate());
        attendance.setOvertimeHours(safeDouble(request.getOvertimeHours()));
        return toDto(attendanceRepository.save(attendance));
    }

    @Transactional
    public void deleteByEmployeeId(Integer employeeId) {
        attendanceRepository.deleteByEmployeeId(employeeId);
    }

    @Transactional
    public void deleteByEmployeeIdAndPeriod(Integer employeeId, LocalDate startDate, LocalDate endDate) {
        attendanceRepository.deleteByEmployeeIdAndAttendanceDateBetween(employeeId, startDate, endDate);
    }

    @Transactional
    public AttendanceImportSummaryDTO importExcel(MultipartFile file) {
        ParseResult parsed = parseExcelSheet(file);
        return saveDailyRows(parsed);
    }

    @Transactional(readOnly = true)
    public AttendancePreviewResultDTO previewExcel(MultipartFile file) {
        ParseResult parsed = parseExcelSheet(file);

        List<AttendancePendingRowDTO> rows = new ArrayList<>(parsed.dailyRows);
        rows.sort(Comparator.comparing(AttendancePendingRowDTO::getEmployeeId)
                .thenComparing(AttendancePendingRowDTO::getAttendanceDate));

        LocalDate overallStart = rows.stream()
                .map(AttendancePendingRowDTO::getAttendanceDate)
                .filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
        LocalDate overallEnd = rows.stream()
                .map(AttendancePendingRowDTO::getAttendanceDate)
                .filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);

        AttendancePreviewResultDTO preview = new AttendancePreviewResultDTO();
        preview.setImportedRows(parsed.importedRows);
        preview.setRows(rows);
        preview.setSkippedEmployeeIds(parsed.skippedEmployeeIds);
        preview.setPeriodStart(overallStart);
        preview.setPeriodEnd(overallEnd);
        return preview;
    }

    @Transactional
    public AttendanceImportSummaryDTO commitPendingRows(List<AttendancePendingRowDTO> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Aucune ligne à valider");
        }
        Set<Integer> seenEmployeeIds = new HashSet<>();
        LocalDate overallStart = null;
        LocalDate overallEnd   = null;

        for (AttendancePendingRowDTO row : rows) {
            LocalDate date = row.getAttendanceDate();
            if (date == null) continue;

            Attendance attendance = attendanceRepository
                    .findByEmployeeIdAndAttendanceDate(row.getEmployeeId(), date)
                    .orElseGet(() -> {
                        Attendance created = new Attendance();
                        created.setEmployeeId(row.getEmployeeId());
                        created.setAttendanceDate(date);
                        return created;
                    });
            attendance.setIsPresent(row.getIsPresent() != null && row.getIsPresent());
            attendance.setIsLate(row.getIsLate() != null && row.getIsLate());
            attendance.setOvertimeHours(row.getOvertimeHours() != null ? round2(row.getOvertimeHours()) : 0.0);
            attendanceRepository.save(attendance);
            seenEmployeeIds.add(row.getEmployeeId());

            if (overallStart == null || date.isBefore(overallStart)) overallStart = date;
            if (overallEnd   == null || date.isAfter(overallEnd))   overallEnd   = date;
        }

        List<Integer> importedEmployeeIds = new ArrayList<>(seenEmployeeIds);
        importedEmployeeIds.sort(Integer::compareTo);

        AttendanceImportSummaryDTO summary = new AttendanceImportSummaryDTO();
        summary.setImportedRows(rows.size());
        summary.setAffectedEmployees(importedEmployeeIds.size());
        summary.setImportedEmployeeIds(importedEmployeeIds);
        summary.setSkippedEmployeeIds(List.of());
        summary.setPeriodStart(overallStart);
        summary.setPeriodEnd(overallEnd);
        return summary;
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private ParseResult parseExcelSheet(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Le fichier Excel est vide");
        }
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.toLowerCase(Locale.ROOT).endsWith(".xlsx")) {
            throw new ResponseStatusException(BAD_REQUEST, "Seuls les fichiers .xlsx sont acceptés");
        }

        try (InputStream inputStream = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(inputStream)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() < 2) {
                throw new ResponseStatusException(BAD_REQUEST, "Le fichier ne contient aucune ligne de données");
            }

            Row headerRow = sheet.getRow(0);
            Map<String, Integer> headerMap = indexHeaders(headerRow);
            Integer employeeIdIndex = headerMap.get("employee_id");
            Integer dateIndex       = headerMap.get("date");
            Integer presentIndex    = headerMap.get("is_present");
            Integer lateIndex       = headerMap.get("is_late");
            Integer overtimeIndex   = headerMap.get("overtime_hours");

            if (employeeIdIndex == null || dateIndex == null || presentIndex == null) {
                throw new ResponseStatusException(BAD_REQUEST,
                        "Colonnes obligatoires manquantes. Attendu: employee_id, date, is_present");
            }

            List<AttendancePendingRowDTO> dailyRows = new ArrayList<>();
            Set<Integer> parsedIds = new HashSet<>();
            int importedRows = 0;

            Iterator<Row> rowIterator = sheet.rowIterator();
            if (rowIterator.hasNext()) rowIterator.next(); // skip header

            while (rowIterator.hasNext()) {
                Row row = rowIterator.next();
                int rowIndex = row.getRowNum();
                if (row == null || isEmptyRow(row)) continue;

                Integer employeeId   = parseIntegerCell(row.getCell(employeeIdIndex), "employee_id", rowIndex);
                LocalDate day        = parseDateCell(row.getCell(dateIndex), rowIndex);
                Boolean isPresent    = parseBooleanCell(row.getCell(presentIndex), "is_present", rowIndex, true);
                Boolean isLate       = parseBooleanCell(lateIndex == null ? null : row.getCell(lateIndex), "is_late", rowIndex, false);
                Double overtimeHours = parseDecimalCell(overtimeIndex == null ? null : row.getCell(overtimeIndex), "overtime_hours", rowIndex, 0.0);

                AttendancePendingRowDTO dto = new AttendancePendingRowDTO();
                dto.setEmployeeId(employeeId);
                dto.setAttendanceDate(day);
                dto.setIsPresent(isPresent);
                dto.setIsLate(isLate);
                dto.setOvertimeHours(overtimeHours);
                dailyRows.add(dto);
                parsedIds.add(employeeId);
                importedRows++;
            }

            if (dailyRows.isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST, "Aucune ligne exploitable trouvée dans le fichier");
            }

            // Validate employee IDs exist in DB
            @SuppressWarnings("null")
            Set<Integer> existingIds = new HashSet<>(
                    employeeRepository.findAllById(parsedIds).stream()
                            .map(emp -> emp.getEmployeeId()).toList()
            );
            List<Integer> skippedIds = parsedIds.stream()
                    .filter(id -> !existingIds.contains(id)).sorted().toList();
            dailyRows.removeIf(r -> skippedIds.contains(r.getEmployeeId()));

            if (dailyRows.isEmpty()) {
                throw new ResponseStatusException(BAD_REQUEST,
                        "Aucun employee_id valide trouvé dans le fichier. IDs inexistants : " + skippedIds);
            }

            ParseResult result = new ParseResult();
            result.importedRows      = importedRows;
            result.dailyRows         = dailyRows;
            result.skippedEmployeeIds = skippedIds;
            return result;

        } catch (IOException exception) {
            throw new ResponseStatusException(BAD_REQUEST, "Impossible de lire le fichier Excel", exception);
        }
    }

    private AttendanceImportSummaryDTO saveDailyRows(ParseResult parsed) {
        return commitPendingRows(parsed.dailyRows);
    }

    private static class ParseResult {
        int importedRows;
        List<AttendancePendingRowDTO> dailyRows;
        List<Integer> skippedEmployeeIds;
    }

    private AttendanceDTO toDto(Attendance attendance) {
        AttendanceDTO dto = new AttendanceDTO();
        dto.setAttendanceId(attendance.getAttendanceId());
        dto.setEmployeeId(attendance.getEmployeeId());
        dto.setAttendanceDate(attendance.getAttendanceDate());
        dto.setIsPresent(attendance.getIsPresent());
        dto.setIsLate(attendance.getIsLate());
        dto.setOvertimeHours(attendance.getOvertimeHours());
        return dto;
    }

    private AttendanceDTO defaultDto(Integer employeeId) {
        AttendanceDTO dto = new AttendanceDTO();
        dto.setAttendanceId(0);
        dto.setEmployeeId(employeeId);
        dto.setAttendanceDate(null);
        dto.setIsPresent(false);
        dto.setIsLate(false);
        dto.setOvertimeHours(0.0);
        return dto;
    }

    private java.util.Map<String, Integer> indexHeaders(Row headerRow) {
        java.util.Map<String, Integer> headers = new java.util.HashMap<>();
        if (headerRow == null) return headers;
        for (Cell cell : headerRow) {
            if (cell == null) continue;
            String name = cell.toString();
            if (name != null && !name.trim().isEmpty()) {
                headers.put(name.trim().toLowerCase(Locale.ROOT), cell.getColumnIndex());
            }
        }
        return headers;
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
        if (cell == null) throw invalidCell(column, rowIndex, "valeur manquante");
        try {
            if (cell.getCellType() == CellType.NUMERIC) return (int) Math.round(cell.getNumericCellValue());
            String value = cell.toString().trim();
            if (value.isEmpty()) throw invalidCell(column, rowIndex, "valeur vide");
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            throw invalidCell(column, rowIndex, "doit être un entier");
        }
    }

    private LocalDate parseDateCell(Cell cell, int rowIndex) {
        if (cell == null) throw invalidCell("date", rowIndex, "valeur manquante");
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getDateCellValue().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        String value = cell.toString().trim();
        if (value.isEmpty()) throw invalidCell("date", rowIndex, "valeur vide");
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException exception) {
            throw invalidCell("date", rowIndex, "format attendu YYYY-MM-DD");
        }
    }

    private Boolean parseBooleanCell(Cell cell, String column, int rowIndex, boolean required) {
        if (cell == null) {
            if (required) throw invalidCell(column, rowIndex, "valeur manquante");
            return false;
        }
        if (cell.getCellType() == CellType.BOOLEAN) return cell.getBooleanCellValue();
        if (cell.getCellType() == CellType.NUMERIC) return Math.round(cell.getNumericCellValue()) == 1;
        String value = cell.toString().trim().toLowerCase(Locale.ROOT);
        if (value.isEmpty()) {
            if (required) throw invalidCell(column, rowIndex, "valeur vide");
            return false;
        }
        if ("1".equals(value) || "true".equals(value) || "oui".equals(value)) return true;
        if ("0".equals(value) || "false".equals(value) || "non".equals(value)) return false;
        throw invalidCell(column, rowIndex, "booléen attendu (0/1, true/false)");
    }

    private Double parseDecimalCell(Cell cell, String column, int rowIndex, Double defaultValue) {
        if (cell == null || cell.getCellType() == CellType.BLANK) return defaultValue;
        try {
            if (cell.getCellType() == CellType.NUMERIC) return cell.getNumericCellValue();
            String value = cell.toString().trim();
            if (value.isEmpty()) return defaultValue;
            return Double.parseDouble(value.replace(',', '.'));
        } catch (NumberFormatException exception) {
            throw invalidCell(column, rowIndex, "doit être un nombre");
        }
    }

    private ResponseStatusException invalidCell(String column, int rowIndex, String message) {
        return new ResponseStatusException(BAD_REQUEST,
                "Ligne " + (rowIndex + 1) + ", colonne '" + column + "': " + message);
    }

    private double safeDouble(Double value) {
        return value == null ? 0.0 : round2(value);
    }

    private double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}


