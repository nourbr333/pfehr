import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Workload {
  workloadId: number;
  employeeId: number;
  projectsAssigned: number;
  projectsCompleted: number;
  tasksAssigned: number;
  tasksCompleted: number;
  averageTaskCompletionTime: number;
}

@Injectable({ providedIn: 'root' })
export class WorkloadService {
  private readonly baseUrl = 'http://localhost:8080/api/employees';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Workload[]> {
    return this.http.get<any[]>(`${this.baseUrl}/workload`).pipe(
      map((rows) => (rows ?? []).map((raw) => this.mapWorkload(raw, 0)))
    );
  }

  getByEmployeeId(employeeId: number): Observable<Workload> {
    return this.http.get<any>(`${this.baseUrl}/${employeeId}/workload`).pipe(
      map((raw) => this.mapWorkload(raw, employeeId))
    );
  }

  private mapWorkload(raw: any, fallbackEmployeeId: number): Workload {
    return {
      workloadId: raw.workloadId ?? raw.workload_id ?? 0,
      employeeId: raw.employeeId ?? raw.employee_id ?? fallbackEmployeeId,
      projectsAssigned: raw.projectsAssigned ?? raw.projects_assigned ?? 0,
      projectsCompleted: raw.projectsCompleted ?? raw.projects_completed ?? 0,
      tasksAssigned: raw.tasksAssigned ?? raw.tasks_assigned ?? 0,
      tasksCompleted: raw.tasksCompleted ?? raw.tasks_completed ?? 0,
      averageTaskCompletionTime:
        raw.averageTaskCompletionTime ?? raw.average_task_completion_time ?? 0
    };
  }
}
