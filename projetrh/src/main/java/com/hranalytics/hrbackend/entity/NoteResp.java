package com.hranalytics.hrbackend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "notes_resp")
public class NoteResp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    /** FK vers users(user_id) — nullable si l'utilisateur est introuvable. */
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "user_email", nullable = false, length = 255)
    private String userEmail;

    /** NULL pour les notes libres non liées à un KPI. */
    @Column(name = "kpi_key", length = 50)
    private String kpiKey;

    /** NULL pour les notes libres non liées à un KPI. */
    @Column(name = "kpi_label", length = 120)
    private String kpiLabel;

    /** Valeur/mesure du KPI au moment de la rédaction (ex : "87.3%", "12 absences"). NULL si non applicable. */
    @Column(name = "kpi_value", length = 255)
    private String kpiValue;

    /** Portée du filtre département au moment du commentaire (ex : « Tous les départements », « IT »). */
    @Column(name = "filter_scope", length = 120)
    private String filterScope;

    /** Libellé de la période active au moment du commentaire. */
    @Column(name = "period_label", length = 120)
    private String periodLabel;

    /** Titre optionnel — surtout utile pour les notes libres. */
    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
