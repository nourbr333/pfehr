package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.TeamObjective;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamObjectiveRepository extends JpaRepository<TeamObjective, Long> {
    List<TeamObjective> findByManagerEmployeeIdOrderByDueDateAsc(Integer managerEmployeeId);

    Optional<TeamObjective> findByObjectiveIdAndManagerEmployeeId(Long objectiveId, Integer managerEmployeeId);
}
