package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Department;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartmentRepository extends JpaRepository<Department, Integer> {
}
