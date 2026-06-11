package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import java.util.List;
import lombok.Data;

@Data
public class DateAlternativeResponseDTO {
    private Long requestId;
    private LocalDate requestedStartDate;
    private LocalDate requestedEndDate;
    private List<DateAlternativeOptionDTO> alternatives;

    @Data
    public static class DateAlternativeOptionDTO {
        private LocalDate startDate;
        private LocalDate endDate;
        private Integer simultaneousAbsences;
        private String note;
    }
}
