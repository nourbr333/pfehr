package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.Data;

@Data
public class OkrImportPreviewResultDTO {
    private int totalRows;
    private int validRows;
    private int invalidRows;
    private List<OkrImportRowDTO> rows;
}
