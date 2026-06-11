package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Event;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EventRepository extends JpaRepository<Event, Long> {
    List<Event> findByAnnuleFalseAndEventDateBetweenOrderByEventDateAscEventTimeAscCreatedAtDesc(LocalDate from, LocalDate to);
}
