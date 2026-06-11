package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.KpiThreshold;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KpiThresholdRepository extends JpaRepository<KpiThreshold, Long> {

    List<KpiThreshold> findByUserId(Long userId);

    Optional<KpiThreshold> findByUserIdAndKpiKey(Long userId, String kpiKey);
}
