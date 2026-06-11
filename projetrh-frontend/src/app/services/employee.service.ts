import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { PageResponse } from '../models/page-response.model';

export interface Employee {
  employeeId: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  gender: string;
  dateOfBirth?: string;
  jobTitle: string;
  hireDate: string;
  maritalStatus: string;
  departmentId: number;
  departmentName: string;
  managerId?: number | null;
  isManager?: boolean;
}

export interface EmployeeImportResult {
  importedRows: number;
  createdEmployees: number;
  importedEmployeeIds: number[];
}

export interface EmployeeImportRowPayload {
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  departmentId: number;
  departmentName?: string | null;
  jobTitle: string;
  hireDate: string;
  managerId?: number | null;
}

export interface EmployeeUpdatePayload {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  gender?: string;
  dateOfBirth?: string | null;
  jobTitle?: string;
  hireDate?: string;
  maritalStatus?: string;
  departmentId?: number;
  managerId?: number | null;
  isManager?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly apiUrl = 'http://localhost:8080/api/employees';

  constructor(private http: HttpClient) {}

  getAllEmployees(): Observable<Employee[]> {
    return this.getEmployeesPage({ unpaged: true }).pipe(map((page) => page.content ?? []));
  }

  getEmployeesPage(params?: {
    page?: number;
    size?: number;
    search?: string;
    departmentId?: number | null;
    unpaged?: boolean;
  }): Observable<PageResponse<Employee>> {
    let httpParams = new HttpParams();
    if (params?.unpaged) {
      httpParams = httpParams.set('unpaged', 'true');
    } else {
      httpParams = httpParams
        .set('page', String(params?.page ?? 0))
        .set('size', String(params?.size ?? 20));
    }
    if (params?.search?.trim()) {
      httpParams = httpParams.set('search', params.search.trim());
    }
    if (params?.departmentId != null && params.departmentId > 0) {
      httpParams = httpParams.set('departmentId', String(params.departmentId));
    }
    return this.http.get<PageResponse<Employee>>(this.apiUrl, { params: httpParams });
  }

  getManagers(): Observable<Employee[]> {
    return this.http.get<Employee[]>(`${this.apiUrl}/managers`);
  }

  getUserIdByEmployee(employeeId: number): Observable<number | null> {
    return this.http.get<number>(`http://localhost:8080/api/admin/users/by-employee/${employeeId}`, { observe: 'response' }).pipe(
      map(resp => resp.status === 204 ? null : (resp.body ?? null))
    );
  }

  getEmployeeById(id: number): Observable<Employee> {
    return this.http.get<Employee>(`${this.apiUrl}/${id}`);
  }

  updateEmployee(id: number, payload: EmployeeUpdatePayload): Observable<Employee> {
    return this.http.put<Employee>(`${this.apiUrl}/${id}`, payload).pipe(
      timeout(15000)
    );
  }

  deleteEmployee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      timeout(15000)
    );
  }

  searchByName(name: string): Observable<Employee[]> {
    return this.http.get<Employee[]>(`${this.apiUrl}/search?name=${encodeURIComponent(name)}`);
  }

  filterByDepartment(deptId: number): Observable<Employee[]> {
    return this.http.get<Employee[]>(`${this.apiUrl}/department/${deptId}`);
  }

  importExcel(file: File): Observable<EmployeeImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.apiUrl}/import-excel`, formData).pipe(
      timeout(60000),
      map((raw) => {
        const importedIdsRaw = raw?.importedEmployeeIds ?? raw?.imported_employee_ids;
        const importedIds = Array.isArray(importedIdsRaw) ? importedIdsRaw : [];
        return {
          importedRows: Number(raw?.importedRows ?? raw?.imported_rows ?? 0),
          createdEmployees: Number(raw?.createdEmployees ?? raw?.created_employees ?? 0),
          importedEmployeeIds: importedIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isFinite(value) && value > 0)
        };
      })
    );
  }

  importRows(rows: EmployeeImportRowPayload[]): Observable<EmployeeImportResult> {
    return this.http.post<any>(`${this.apiUrl}/import-rows`, rows).pipe(
      timeout(20000),
      map((raw) => {
        const importedIdsRaw = raw?.importedEmployeeIds ?? raw?.imported_employee_ids;
        const importedIds = Array.isArray(importedIdsRaw) ? importedIdsRaw : [];
        return {
          importedRows: Number(raw?.importedRows ?? raw?.imported_rows ?? 0),
          createdEmployees: Number(raw?.createdEmployees ?? raw?.created_employees ?? 0),
          importedEmployeeIds: importedIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isFinite(value) && value > 0)
        };
      })
    );
  }
}
