package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Workload;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkloadRepository extends JpaRepository<Workload, Integer> {
    Optional<Workload> findByEmployeeId(Integer employeeId);
    List<Workload> findByEmployeeIdIn(List<Integer> employeeIds);
}
