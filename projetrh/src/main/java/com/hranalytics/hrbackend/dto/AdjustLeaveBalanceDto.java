package com.hranalytics.hrbackend.dto;

public class AdjustLeaveBalanceDto {
    private Double adjustment;
    private String reason;

    public Double getAdjustment() { return adjustment; }
    public void setAdjustment(Double adjustment) { this.adjustment = adjustment; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
