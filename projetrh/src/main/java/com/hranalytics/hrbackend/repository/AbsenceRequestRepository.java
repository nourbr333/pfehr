package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.AbsenceRequest;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AbsenceRequestRepository extends JpaRepository<AbsenceRequest, Long> {
    List<AbsenceRequest> findByManagerIdOrderByRequestedAtDesc(Integer managerId);

    List<AbsenceRequest> findByManagerIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
            Integer managerId, LocalDate periodEnd, LocalDate periodStart);

    List<AbsenceRequest> findByManagerIdAndStatusInOrderByRequestedAtDesc(Integer managerId, Collection<String> statuses);

    List<AbsenceRequest> findByEmployeeIdInAndStatusInAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
            Collection<Integer> employeeIds, Collection<String> statuses, LocalDate periodEnd, LocalDate periodStart);
}
