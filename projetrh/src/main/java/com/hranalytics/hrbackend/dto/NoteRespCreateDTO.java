package com.hranalytics.hrbackend.dto;

public class NoteRespCreateDTO {

    /** Email de l'auteur (obligatoire). */
    private String userEmail;

    /** Clé du KPI — null pour une note libre. */
    private String kpiKey;

    /** Libellé du KPI — null pour une note libre. */
    private String kpiLabel;

    /** Valeur/mesure du KPI au moment de la rédaction (ex : "87.3%", "12 absences"). Null si non applicable. */
    private String kpiValue;

    /** Portée du filtre département au moment du commentaire. */
    private String filterScope;

    /** Libellé de la période active au moment du commentaire. */
    private String periodLabel;

    /** Titre optionnel. */
    private String title;

    /** Corps de la note (obligatoire, non vide). */
    private String content;

    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }

    public String getKpiKey() { return kpiKey; }
    public void setKpiKey(String kpiKey) { this.kpiKey = kpiKey; }

    public String getKpiLabel() { return kpiLabel; }
    public void setKpiLabel(String kpiLabel) { this.kpiLabel = kpiLabel; }

    public String getKpiValue() { return kpiValue; }
    public void setKpiValue(String kpiValue) { this.kpiValue = kpiValue; }

    public String getFilterScope() { return filterScope; }
    public void setFilterScope(String filterScope) { this.filterScope = filterScope; }

    public String getPeriodLabel() { return periodLabel; }
    public void setPeriodLabel(String periodLabel) { this.periodLabel = periodLabel; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
