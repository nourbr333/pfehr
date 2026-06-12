package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.AdminAuditLog;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminAuditLogRepository extends JpaRepository<AdminAuditLog, Long> {

    List<AdminAuditLog> findAllByOrderByCreatedAtDesc();

    Optional<AdminAuditLog> findTopByUserUserIdAndActionOrderByCreatedAtDesc(Long userId, String action);

    @Query("""
            SELECT l FROM AdminAuditLog l
            WHERE (:targetName IS NULL OR TRIM(:targetName) = '' OR l.targetName = :targetName)
              AND (:dateFrom IS NULL OR l.createdAt >= :dateFrom)
              AND (:dateTo IS NULL OR l.createdAt < :dateTo)
              AND (
                    :search IS NULL OR TRIM(:search) = ''
                    OR LOWER(l.action) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.targetName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.performedBy) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.details) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
            """)
    Page<AdminAuditLog> findFiltered(
            @Param("search") String search,
            @Param("targetName") String targetName,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            Pageable pageable);

    @Query("""
            SELECT l FROM AdminAuditLog l
            WHERE (:targetName IS NULL OR TRIM(:targetName) = '' OR l.targetName = :targetName)
              AND (:dateFrom IS NULL OR l.createdAt >= :dateFrom)
              AND (:dateTo IS NULL OR l.createdAt < :dateTo)
              AND (
                    :search IS NULL OR TRIM(:search) = ''
                    OR LOWER(l.action) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.targetName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.performedBy) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.details) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
              AND l.action IN :actions
            """)
    Page<AdminAuditLog> findFilteredByActions(
            @Param("search") String search,
            @Param("targetName") String targetName,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo,
            @Param("actions") List<String> actions,
            Pageable pageable);

    @Query("""
            SELECT DISTINCT l.targetName FROM AdminAuditLog l
            WHERE l.targetName IS NOT NULL AND TRIM(l.targetName) <> ''
            ORDER BY l.targetName ASC
            """)
    List<String> findDistinctTargetNames();

    @Query("""
            SELECT l.action, COUNT(l) FROM AdminAuditLog l
            WHERE (:targetName IS NULL OR TRIM(:targetName) = '' OR l.targetName = :targetName)
              AND (:dateFrom IS NULL OR l.createdAt >= :dateFrom)
              AND (:dateTo IS NULL OR l.createdAt < :dateTo)
              AND (
                    :search IS NULL OR TRIM(:search) = ''
                    OR LOWER(l.action) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.targetName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.performedBy) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(l.details) LIKE LOWER(CONCAT('%', :search, '%'))
                  )
            GROUP BY l.action
            """)
    List<Object[]> countByActionFiltered(
            @Param("search") String search,
            @Param("targetName") String targetName,
            @Param("dateFrom") LocalDateTime dateFrom,
            @Param("dateTo") LocalDateTime dateTo);
}
