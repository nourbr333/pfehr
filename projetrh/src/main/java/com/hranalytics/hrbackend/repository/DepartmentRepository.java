package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DepartmentRepository extends JpaRepository<Department, Integer> {

    boolean existsByDepartmentNameIgnoreCase(String departmentName);

    boolean existsByDepartmentIdNotAndDepartmentNameIgnoreCase(Integer departmentId, String departmentName);

    @Query("select coalesce(max(d.departmentId), 0) from Department d")
    Integer findMaxDepartmentId();
}
