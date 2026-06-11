package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findAllByOrderByCreatedAtDesc();

    /** Returns notifications targeted to this user only (per-user read state). */
    @Query("SELECT n FROM Notification n WHERE n.recipientId = :userId ORDER BY n.createdAt DESC")
    List<Notification> findForUser(Long userId);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.id = :id AND n.recipientId = :userId")
    void markAsReadForUser(Long id, Long userId);

    @Modifying
    @Query("UPDATE Notification n SET n.isRead = true WHERE n.recipientId = :userId")
    void markAllAsReadForUser(Long userId);
}
