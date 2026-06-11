import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PageResponse } from '../../../models/page-response.model';
import { LeaveRequest, LeaveStatus, LeaveConflict, CreateLeaveRequestDto } from '../absences-conges.models';

@Injectable({ providedIn: 'root' })
export class LeaveRequestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api/leave-requests';

  getAll(params?: { status?: LeaveStatus; employeeId?: number; departmentId?: number }): Observable<LeaveRequest[]> {
    return this.getPage({ ...params, unpaged: true }).pipe(map((page) => page.content ?? []));
  }

  getPage(params?: {
    page?: number;
    size?: number;
    status?: LeaveStatus;
    employeeId?: number;
    unpaged?: boolean;
  }): Observable<PageResponse<LeaveRequest>> {
    let httpParams = new HttpParams();
    if (params?.unpaged) {
      httpParams = httpParams.set('unpaged', 'true');
    } else {
      httpParams = httpParams
        .set('page', String(params?.page ?? 0))
        .set('size', String(params?.size ?? 20));
    }
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.employeeId) httpParams = httpParams.set('employeeId', params.employeeId.toString());
    return this.http.get<PageResponse<LeaveRequest>>(this.baseUrl, { params: httpParams });
  }

  getById(id: number): Observable<LeaveRequest> {
    return this.http.get<LeaveRequest>(`${this.baseUrl}/${id}`);
  }

  create(dto: CreateLeaveRequestDto): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(this.baseUrl, dto);
  }

  updateStatus(id: number, status: LeaveStatus, rejectionReason?: string): Observable<LeaveRequest> {
    return this.http.patch<LeaveRequest>(`${this.baseUrl}/${id}/status`, { status, rejectionReason });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  detectConflicts(dto: { employeeId: number; startDate: string; endDate: string }): Observable<LeaveConflict[]> {
    const params = new HttpParams()
      .set('employeeId', dto.employeeId.toString())
      .set('startDate', dto.startDate)
      .set('endDate', dto.endDate);
    return this.http.get<LeaveConflict[]>(`${this.baseUrl}/conflicts`, { params });
  }

  getKpiOngoingThisMonth(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/kpis/ongoing-this-month`);
  }

  getKpiPendingCount(): Observable<number> {
    return this.http.get<number>(`${this.baseUrl}/kpis/pending-count`);
  }
}
