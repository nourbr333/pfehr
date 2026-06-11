import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { PageResponse } from '../models/page-response.model';

export interface Attendance {
  attendanceId: number;
  employeeId: number;
  attendanceDate: string;
  isPresent: boolean;
  isLate: boolean;
  overtimeHours: number;
}

export interface AttendanceManualUpdatePayload {
  attendanceDate: string;
  isPresent: boolean;
  isLate: boolean;
  overtimeHours: number;
}

export interface AttendanceImportResult {
  importedRows: number;
  affectedEmployees: number;
  importedEmployeeIds: number[];
  skippedEmployeeIds: number[];
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AttendancePendingRow {
  employeeId: number;
  attendanceDate: string;
  isPresent: boolean;
  isLate: boolean;
  overtimeHours: number;
}

export interface AttendancePreviewResult {
  importedRows: number;
  rows: AttendancePendingRow[];
  skippedEmployeeIds: number[];
  periodStart: string | null;
  periodEnd: string | null;
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly employeeBaseUrl = 'http://localhost:8080/api/employees';
  private readonly hrBaseUrl = 'http://localhost:8080/api/hr/attendance';

  constructor(private http: HttpClient) {}

  getAll(): Observable<Attendance[]> {
    return this.getAllPage({ unpaged: true, useHr: false }).pipe(map((page) => page.content ?? []));
  }

  getAllHr(): Observable<Attendance[]> {
    return this.getAllPage({ unpaged: true, useHr: true }).pipe(map((page) => page.content ?? []));
  }

  getAllPage(params?: {
    page?: number;
    size?: number;
    unpaged?: boolean;
    useHr?: boolean;
  }): Observable<PageResponse<Attendance>> {
    const baseUrl = params?.useHr ? this.hrBaseUrl : `${this.employeeBaseUrl}/attendance`;
    let httpParams = new HttpParams();
    if (params?.unpaged) {
      httpParams = httpParams.set('unpaged', 'true');
    } else {
      httpParams = httpParams
        .set('page', String(params?.page ?? 0))
        .set('size', String(params?.size ?? 20));
    }
    return this.http.get<PageResponse<any>>(baseUrl, { params: httpParams }).pipe(
      map((page) => ({
        ...page,
        content: (page.content ?? []).map((raw) => this.toAttendance(raw))
      }))
    );
  }

  getByEmployeeId(employeeId: number): Observable<Attendance> {
    return this.http.get<any>(`${this.employeeBaseUrl}/${employeeId}/attendance`).pipe(map((raw) => this.toAttendance(raw, employeeId)));
  }

  getByEmployeeIdHr(employeeId: number): Observable<Attendance> {
    return this.http.get<any>(`${this.hrBaseUrl}/${employeeId}`).pipe(map((raw) => this.toAttendance(raw, employeeId)));
  }

  updateByEmployeeIdHr(employeeId: number, payload: AttendanceManualUpdatePayload): Observable<Attendance> {
    return this.http.put<any>(`${this.hrBaseUrl}/${employeeId}`, payload).pipe(map((raw) => this.toAttendance(raw, employeeId)));
  }

  deleteByEmployeeIdHr(employeeId: number): Observable<void> {
    return this.http.delete<void>(`${this.hrBaseUrl}/${employeeId}`);
  }

  deleteByEmployeeIdAndPeriodHr(employeeId: number, periodStart: string, periodEnd: string): Observable<void> {
    return this.http.delete<void>(`${this.hrBaseUrl}/${employeeId}/${periodStart}/${periodEnd}`);
  }

  importExcel(file: File): Observable<AttendanceImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.hrBaseUrl}/import-excel`, formData).pipe(
      timeout(15000),
      map((raw) => this.toImportResult(raw))
    );
  }

  previewExcel(file: File): Observable<AttendancePreviewResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(`${this.hrBaseUrl}/preview-excel`, formData).pipe(
      timeout(15000),
      map((raw) => ({
        importedRows: Number(raw?.importedRows ?? 0),
        rows: (raw?.rows ?? []).map((r: any): AttendancePendingRow => ({
          employeeId: Number(r?.employeeId ?? 0),
          attendanceDate: this.toIso(r?.attendanceDate) ?? '',
          isPresent: Boolean(r?.isPresent ?? false),
          isLate: Boolean(r?.isLate ?? false),
          overtimeHours: Number(r?.overtimeHours ?? 0),
        })),
        skippedEmployeeIds: (raw?.skippedEmployeeIds ?? []).map((v: any) => Number(v)).filter((v: number) => v > 0),
        periodStart: this.toIso(raw?.periodStart),
        periodEnd: this.toIso(raw?.periodEnd),
      }))
    );
  }

  commitImport(rows: AttendancePendingRow[]): Observable<AttendanceImportResult> {
    return this.http.post<any>(`${this.hrBaseUrl}/commit`, rows).pipe(
      map((raw) => this.toImportResult(raw))
    );
  }

  private toAttendance(raw: any, fallbackEmployeeId = 0): Attendance {
    return {
      attendanceId: Number(raw?.attendanceId ?? raw?.attendance_id ?? 0),
      employeeId: Number(raw?.employeeId ?? raw?.employee_id ?? fallbackEmployeeId),
      attendanceDate: this.toIso(raw?.attendanceDate ?? raw?.attendance_date) ?? '',
      isPresent: Boolean(raw?.isPresent ?? raw?.is_present ?? false),
      isLate: Boolean(raw?.isLate ?? raw?.is_late ?? false),
      overtimeHours: Number(raw?.overtimeHours ?? raw?.overtime_hours ?? 0),
    };
  }

  private toImportResult(raw: any): AttendanceImportResult {
    const importedIds = Array.isArray(raw?.importedEmployeeIds) ? raw.importedEmployeeIds : [];
    const skippedIds  = Array.isArray(raw?.skippedEmployeeIds)  ? raw.skippedEmployeeIds  : [];
    return {
      importedRows: Number(raw?.importedRows ?? 0),
      affectedEmployees: Number(raw?.affectedEmployees ?? 0),
      importedEmployeeIds: importedIds.map((v: any) => Number(v)).filter((v: number) => v > 0),
      skippedEmployeeIds:  skippedIds.map((v: any) => Number(v)).filter((v: number) => v > 0),
      periodStart: this.toIso(raw?.periodStart),
      periodEnd:   this.toIso(raw?.periodEnd),
    };
  }

  /** Normalises a date from the backend: ISO string OR Jackson array [y,m,d] → "yyyy-MM-dd" or null */
  private toIso(val: any): string | null {
    if (val == null) return null;
    if (typeof val === 'string' && val.length > 0) return val;
    if (Array.isArray(val) && val.length >= 3) {
      const [y, m, d] = val;
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }
}
