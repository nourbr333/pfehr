package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.EmployeeCoverageProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeCoverageProfileRepository extends JpaRepository<EmployeeCoverageProfile, Integer> {
    List<EmployeeCoverageProfile> findByEmployeeIdIn(Collection<Integer> employeeIds);
}
