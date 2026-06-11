package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Employee;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmployeeRepository extends JpaRepository<Employee, Integer> {

    @Query("""
            SELECT e FROM Employee e
            WHERE (:departmentId IS NULL OR e.department.departmentId = :departmentId)
              AND (
                    :search IS NULL OR TRIM(:search) = ''
                    OR LOWER(e.firstName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(e.lastName) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR LOWER(CONCAT(e.firstName, ' ', e.lastName)) LIKE LOWER(CONCAT('%', :search, '%'))
                    OR CONCAT(e.employeeId, '') LIKE CONCAT('%', :search, '%')
                  )
            """)
    Page<Employee> findFiltered(
            @Param("search") String search,
            @Param("departmentId") Integer departmentId,
            Pageable pageable);
    List<Employee> findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(String firstName, String lastName);
    List<Employee> findByDepartment_DepartmentId(Integer departmentId);
    long countByDepartment_DepartmentId(Integer departmentId);

    @Query("select e.department.departmentId, count(e) from Employee e where e.department is not null group by e.department.departmentId")
    List<Object[]> countGroupedByDepartment();
    List<Employee> findByManagerIdOrEmployeeId(Integer managerId, Integer employeeId);
    boolean existsByEmployeeIdAndManagerId(Integer employeeId, Integer managerId);

    boolean existsByEmailIgnoreCase(String email);
    boolean existsByEmployeeIdNotAndEmailIgnoreCase(Integer employeeId, String email);
    boolean existsByManagerId(Integer managerId);
    List<Employee> findByManagerId(Integer managerId);
    List<Employee> findByIsManagerTrue();

    @Query("select coalesce(max(e.employeeId), 0) from Employee e")
    Integer findMaxEmployeeId();
}
