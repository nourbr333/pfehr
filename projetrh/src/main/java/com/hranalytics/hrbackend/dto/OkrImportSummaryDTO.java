package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.Data;

@Data
public class OkrImportSummaryDTO {
    private int insertedRows;
    private int skippedRows;
    private List<String> skippedTitles;
}
