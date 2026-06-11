package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.AppUser;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    @EntityGraph(attributePaths = {"employee"})
    Optional<AppUser> findByEmailIgnoreCaseAndIsActiveTrue(String email);

    @EntityGraph(attributePaths = {"employee"})
    @Query("SELECT u FROM AppUser u JOIN u.employee e "
            + "WHERE LOWER(TRIM(e.email)) = LOWER(TRIM(:email)) AND u.isActive = true")
    Optional<AppUser> findActiveByLinkedEmployeeEmail(@Param("email") String email);

    @EntityGraph(attributePaths = {"employee"})
    List<AppUser> findByIsActiveTrue();

    @EntityGraph(attributePaths = {"employee"})
    List<AppUser> findAllByOrderByUserIdDesc();

    @EntityGraph(attributePaths = {"employee"})
    Optional<AppUser> findByUserId(Long userId);

    List<AppUser> findByRoleAndIsActiveTrue(String role);

    List<AppUser> findByRoleInAndIsActiveTrue(List<String> roles);

    Optional<AppUser> findByEmployee_EmployeeIdAndIsActiveTrue(Long employeeId);
}
