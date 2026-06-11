package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.WorkloadDTO;
import com.hranalytics.hrbackend.entity.Workload;
import com.hranalytics.hrbackend.repository.WorkloadRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class WorkloadService {

    private final WorkloadRepository workloadRepository;

    public WorkloadService(WorkloadRepository workloadRepository) {
        this.workloadRepository = workloadRepository;
    }

    public WorkloadDTO findByEmployeeIdOrDefault(Integer employeeId) {
        if (employeeId == null) {
            return defaultDto(null);
        }
        return workloadRepository.findByEmployeeId(employeeId)
                .map(this::toDto)
                .orElseGet(() -> defaultDto(employeeId));
    }

    public List<WorkloadDTO> findAll() {
        return workloadRepository.findAll().stream().map(this::toDto).toList();
    }

    private WorkloadDTO toDto(Workload workload) {
        WorkloadDTO dto = new WorkloadDTO();
        dto.setWorkloadId(workload.getWorkloadId());
        dto.setEmployeeId(workload.getEmployeeId());
        dto.setProjectsAssigned(workload.getProjectsAssigned());
        dto.setProjectsCompleted(workload.getProjectsCompleted());
        dto.setTasksAssigned(workload.getTasksAssigned());
        dto.setTasksCompleted(workload.getTasksCompleted());
        dto.setAverageTaskCompletionTime(workload.getAverageTaskCompletionTime());
        return dto;
    }

    private WorkloadDTO defaultDto(Integer employeeId) {
        WorkloadDTO dto = new WorkloadDTO();
        dto.setWorkloadId(0);
        dto.setEmployeeId(employeeId);
        dto.setProjectsAssigned(0);
        dto.setProjectsCompleted(0);
        dto.setTasksAssigned(0);
        dto.setTasksCompleted(0);
        dto.setAverageTaskCompletionTime(0.0);
        return dto;
    }
}
