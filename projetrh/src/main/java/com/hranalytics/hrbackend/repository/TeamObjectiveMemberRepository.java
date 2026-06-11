package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.TeamObjectiveMember;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface TeamObjectiveMemberRepository extends JpaRepository<TeamObjectiveMember, Long> {

    List<TeamObjectiveMember> findByObjectiveId(Long objectiveId);

    List<TeamObjectiveMember> findByObjectiveIdIn(List<Long> objectiveIds);

    @Modifying
    @Transactional
    @Query("DELETE FROM TeamObjectiveMember m WHERE m.objectiveId = :objectiveId")
    void deleteByObjectiveId(@Param("objectiveId") Long objectiveId);
}
