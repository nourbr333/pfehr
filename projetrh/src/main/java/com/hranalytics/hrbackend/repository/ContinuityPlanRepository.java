package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.ContinuityPlan;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContinuityPlanRepository extends JpaRepository<ContinuityPlan, Long> {
    List<ContinuityPlan> findByManagerIdOrderByCreatedAtDesc(Integer managerId);
}
