package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.ObjectiveMilestone;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ObjectiveMilestoneRepository extends JpaRepository<ObjectiveMilestone, Long> {
    List<ObjectiveMilestone> findByObjectiveIdInOrderByPlannedDateAsc(List<Long> objectiveIds);
}
