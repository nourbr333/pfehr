package com.hranalytics.hrbackend.dto;

import java.util.List;
import lombok.Data;

@Data
public class OkrCommitImportRequestDTO {
    private List<OkrImportRowDTO> rows;
}
