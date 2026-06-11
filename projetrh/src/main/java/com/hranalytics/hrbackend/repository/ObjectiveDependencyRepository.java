package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.ObjectiveDependency;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ObjectiveDependencyRepository extends JpaRepository<ObjectiveDependency, Long> {
    List<ObjectiveDependency> findByObjectiveIdIn(List<Long> objectiveIds);
    void deleteByObjectiveId(Long objectiveId);
}
