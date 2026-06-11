package com.hranalytics.hrbackend.dto;

public class LeavePolicyDto {
    private Integer id;
    private String type;
    private String label;
    private Integer maxDaysPerYear;
    private Boolean requiresDocument;
    private String color;
    private Boolean isActive;

    public Integer getId() { return id; }
    public void setId(Integer id) { this.id = id; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public Integer getMaxDaysPerYear() { return maxDaysPerYear; }
    public void setMaxDaysPerYear(Integer maxDaysPerYear) { this.maxDaysPerYear = maxDaysPerYear; }

    public Boolean getRequiresDocument() { return requiresDocument; }
    public void setRequiresDocument(Boolean requiresDocument) { this.requiresDocument = requiresDocument; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
