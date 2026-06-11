package com.hranalytics.hrbackend.model;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

/**
 * KPI keys eligible for threshold / target configuration.
 */
public enum KpiKey {
    ATTENDANCE("attendance", true),
    ABSENTEISME("absenteisme", false),
    RETARD("retard", false);

    private static final Set<String> ALLOWED = Set.of(
            ATTENDANCE.key, ABSENTEISME.key, RETARD.key
    );

    private final String key;
    /** true = higher value is better (attendance); false = lower is better. */
    private final boolean higherIsBetter;

    KpiKey(String key, boolean higherIsBetter) {
        this.key = key;
        this.higherIsBetter = higherIsBetter;
    }

    public String getKey() {
        return key;
    }

    public boolean isHigherIsBetter() {
        return higherIsBetter;
    }

    public static KpiKey fromKey(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "kpiKey is required");
        }
        String normalized = raw.trim().toLowerCase();
        for (KpiKey k : values()) {
            if (k.key.equals(normalized)) {
                return k;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Invalid kpiKey: " + raw + ". Allowed: attendance, absenteisme, retard");
    }

    public static boolean isAllowed(String raw) {
        return raw != null && ALLOWED.contains(raw.trim().toLowerCase());
    }
}
