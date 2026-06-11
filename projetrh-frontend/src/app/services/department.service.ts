import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Department {
  departmentId: number;
  departmentName: string;
  departmentHead: string;
  employeeCount: number;
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
}
