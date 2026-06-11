import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';

export interface EmployeeEvaluation {
  evaluationId: number;
  employeeId: number;
  managerId: number;
  evaluatedAt: string;
  period: string | null;
  objectifs: string | null;
  summary: string | null;
  comments: string | null;
  rating: number | null;
}

export interface CreateEmployeeEvaluationPayload {
  managerId: number;
  evaluatedAt?: string;
  period?: string | null;
  objectifs?: string | null;
  summary?: string | null;
  comments?: string | null;
  rating?: number | null;
}

export interface EvaluationImportRowPayload {
  employeeId: number;
  period?: string | null;
  rating: number;
  objectifs?: string | null;
  comments?: string | null;
  evaluatedAt?: string | null;
}

export interface EvaluationImportSummary {
  importedRows: number;
  affectedEmployees: number;
  importedEmployeeIds: number[];
  skippedEmployeeIds: number[];
}

@Injectable({ providedIn: 'root' })
export class EvaluationService {
  private readonly baseUrl = 'http://localhost:8080/api/employees';
  private readonly managersUrl = 'http://localhost:8080/api/managers';

  constructor(private http: HttpClient) {}

  listByEmployeeId(employeeId: number): Observable<EmployeeEvaluation[]> {
    return this.http.get<unknown[]>(`${this.baseUrl}/${employeeId}/evaluations`).pipe(
      map((rows) =>
        (rows ?? []).map((raw: any) => ({
          evaluationId: raw.evaluationId ?? raw.evaluation_id ?? 0,
          employeeId: raw.employeeId ?? raw.employee_id ?? employeeId,
          managerId: raw.managerId ?? raw.manager_id ?? 0,
          evaluatedAt: raw.evaluatedAt ?? raw.evaluated_at ?? '',
          period: raw.period ?? null,
          objectifs: raw.objectifs ?? raw.objectif ?? null,
          summary: raw.summary ?? null,
          comments: raw.comments ?? null,
          rating: raw.rating ?? null
        }))
      )
    );
  }

  createForEmployee(employeeId: number, payload: CreateEmployeeEvaluationPayload): Observable<EmployeeEvaluation> {
    return this.http.post<any>(`${this.baseUrl}/${employeeId}/evaluations`, payload).pipe(
      map((raw) => ({
        evaluationId: raw?.evaluationId ?? raw?.evaluation_id ?? 0,
        employeeId: raw?.employeeId ?? raw?.employee_id ?? employeeId,
        managerId: raw?.managerId ?? raw?.manager_id ?? payload.managerId,
        evaluatedAt: raw?.evaluatedAt ?? raw?.evaluated_at ?? '',
        period: raw?.period ?? null,
        objectifs: raw?.objectifs ?? raw?.objectif ?? payload.objectifs ?? null,
        summary: raw?.summary ?? null,
        comments: raw?.comments ?? null,
        rating: raw?.rating ?? null
      }))
    );
  }

  updateForEmployee(employeeId: number, evaluationId: number, payload: CreateEmployeeEvaluationPayload): Observable<EmployeeEvaluation> {
    return this.http.put<any>(`${this.baseUrl}/${employeeId}/evaluations/${evaluationId}`, payload).pipe(
      map((raw) => ({
        evaluationId: raw?.evaluationId ?? raw?.evaluation_id ?? evaluationId,
        employeeId: raw?.employeeId ?? raw?.employee_id ?? employeeId,
        managerId: raw?.managerId ?? raw?.manager_id ?? payload.managerId,
        evaluatedAt: raw?.evaluatedAt ?? raw?.evaluated_at ?? '',
        period: raw?.period ?? null,
        objectifs: raw?.objectifs ?? raw?.objectif ?? payload.objectifs ?? null,
        summary: raw?.summary ?? null,
        comments: raw?.comments ?? null,
        rating: raw?.rating ?? null
      }))
    );
  }

  deleteForEmployee(employeeId: number, evaluationId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${employeeId}/evaluations/${evaluationId}`);
  }

  importRowsForManager(managerId: number, rows: EvaluationImportRowPayload[]): Observable<EvaluationImportSummary> {
    return this.http.post<EvaluationImportSummary>(
      `${this.managersUrl}/${managerId}/import-evaluations-rows`,
      rows
    ).pipe(timeout(60000));
  }

  importExcelForManager(managerId: number, file: File): Observable<EvaluationImportSummary> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<EvaluationImportSummary>(
      `${this.managersUrl}/${managerId}/import-evaluations-excel`,
      formData
    ).pipe(timeout(60000));
  }
}
