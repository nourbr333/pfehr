import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface Department {
  departmentId: number;
  departmentName: string;
  departmentHead: string;
  employeeCount: number;
  description?: string | null;
  active?: boolean;
}

export interface DepartmentCreatePayload {
  departmentName: string;
  departmentHead?: string | null;
  description?: string | null;
  active?: boolean;
}

export interface DepartmentUpdatePayload {
  departmentName?: string;
  departmentHead?: string | null;
  description?: string | null;
  active?: boolean;
}

export interface DepartmentStats {
  departmentId: number;
  departmentName: string;
  employeeCount: number;
  evaluatedEmployees: number;
  averagePerformanceScore: number;
  averageAttendanceRate: number;
}

export interface DepartmentEmployee {
  employeeId: number;
  firstName: string;
  lastName: string;
  jobTitle: string;
}

@Injectable({ providedIn: 'root' })
export class DepartmentService {
  private readonly apiUrl = 'http://localhost:8080/api/departments';

  constructor(private http: HttpClient) {}

  getAllDepartments(): Observable<Department[]> {
    return this.http.get<Department[]>(this.apiUrl);
  }

  getAllDepartmentStats(): Observable<DepartmentStats[]> {
    return this.http.get<DepartmentStats[]>(`${this.apiUrl}/stats`);
  }

  getDepartmentStatsById(departmentId: number): Observable<DepartmentStats> {
    return this.http.get<DepartmentStats>(`${this.apiUrl}/${departmentId}/stats`);
  }

  getDepartmentEmployees(departmentId: number): Observable<DepartmentEmployee[]> {
    return this.http.get<DepartmentEmployee[]>(`${this.apiUrl}/${departmentId}/employees`);
  }

  createDepartment(payload: DepartmentCreatePayload): Observable<Department> {
    return this.http.post<Department>(this.apiUrl, payload).pipe(
      timeout(15000)
    );
  }

  updateDepartment(departmentId: number, payload: DepartmentUpdatePayload): Observable<Department> {
    return this.http.put<Department>(`${this.apiUrl}/${departmentId}`, payload).pipe(
      timeout(15000)
    );
  }

  deleteDepartment(departmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${departmentId}`).pipe(
      timeout(15000)
    );
  }
}
