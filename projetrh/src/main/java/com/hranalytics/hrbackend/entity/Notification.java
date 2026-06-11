package com.hranalytics.hrbackend.entity;

import jakarta.persistence.*;
import lombok.Data;
import java.time.OffsetDateTime;

@Data
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "type", nullable = false, length = 40)
    private String type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "message", nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "is_read", nullable = false)
    private Boolean isRead = Boolean.FALSE;

    @Column(name = "source_table", length = 60)
    private String sourceTable;

    @Column(name = "source_id")
    private Long sourceId;

    /** Null = broadcast (visible to all); non-null = visible only to this user. */
    @Column(name = "recipient_id")
    private Long recipientId;

    /** Optional URL to navigate to when the notification is clicked. */
    @Column(name = "target_url", length = 500)
    private String targetUrl;
}
