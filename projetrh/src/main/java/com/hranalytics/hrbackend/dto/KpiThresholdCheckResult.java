package com.hranalytics.hrbackend.dto;

import lombok.Data;

/** Result of one KPI threshold breach/target check. */
@Data
public class KpiThresholdCheckResult {
    private String kpiKey;
    /** true when current value breaches the configured threshold */
    private boolean thresholdBreached;
    /** true when current value meets or beats the configured target */
    private boolean targetAchieved;
    /** The notification message generated (null if nothing triggered) */
    private String notificationMessage;
}
