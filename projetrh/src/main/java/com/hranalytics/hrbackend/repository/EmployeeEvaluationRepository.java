package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.EmployeeEvaluation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmployeeEvaluationRepository extends JpaRepository<EmployeeEvaluation, Integer> {

    @Query(
            "SELECT e FROM EmployeeEvaluation e WHERE e.employeeId = :employeeId "
                    + "ORDER BY e.evaluatedAt DESC NULLS LAST, e.evaluationId DESC")
    List<EmployeeEvaluation> findAllByEmployeeIdNewestFirst(@Param("employeeId") Integer employeeId);

    List<EmployeeEvaluation> findByEmployeeIdIn(List<Integer> employeeIds);

    Optional<EmployeeEvaluation> findByEvaluationIdAndEmployeeId(Integer evaluationId, Integer employeeId);
}
