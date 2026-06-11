package com.hranalytics.hrbackend.repository;

import com.hranalytics.hrbackend.entity.Attendance;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AttendanceRepository extends JpaRepository<Attendance, Integer> {

    Page<Attendance> findAllByOrderByEmployeeIdAscAttendanceDateAsc(Pageable pageable);

    Optional<Attendance> findByEmployeeIdAndAttendanceDate(Integer employeeId, LocalDate attendanceDate);

    List<Attendance> findByEmployeeIdOrderByAttendanceDateAsc(Integer employeeId);

    List<Attendance> findByEmployeeIdAndAttendanceDateBetweenOrderByAttendanceDateAsc(
            Integer employeeId, LocalDate start, LocalDate end);

    @Query(value = "SELECT * FROM attendance WHERE employee_id = :employeeId ORDER BY attendance_date DESC LIMIT 1", nativeQuery = true)
    Optional<Attendance> findLatestByEmployeeId(@Param("employeeId") Integer employeeId);

    void deleteByEmployeeId(Integer employeeId);

    void deleteByEmployeeIdAndAttendanceDateBetween(Integer employeeId, LocalDate start, LocalDate end);

    List<Attendance> findByEmployeeIdIn(List<Integer> employeeIds);

    @Query("select coalesce(max(a.attendanceId), 0) from Attendance a")
    Integer findMaxAttendanceId();
}

