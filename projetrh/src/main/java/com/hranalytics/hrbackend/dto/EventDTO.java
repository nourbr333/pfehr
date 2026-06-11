package com.hranalytics.hrbackend.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.Data;

@Data
public class EventDTO {
    private Long eventId;
    private String title;
    private String description;
    private LocalDate eventDate;
    private LocalTime eventTime;
    private String eventType;
    private String targetType;
    private Integer targetDepartmentId;
    private String targetJobTitle;
    private List<Integer> targetEmployeeIds;
    private Integer createdByEmployeeId;
    private String createdByName;
    private String createdByRole;
    private Boolean annule;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
