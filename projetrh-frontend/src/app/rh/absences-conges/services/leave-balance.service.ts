import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LeaveBalance, AdjustLeaveBalanceDto } from '../absences-conges.models';

@Injectable({ providedIn: 'root' })
export class LeaveBalanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api/leave-balances';

  getByEmployee(employeeId: number, year?: number): Observable<LeaveBalance[]> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    return this.http.get<LeaveBalance[]>(`${this.baseUrl}/${employeeId}`, { params });
  }

  getAll(year?: number): Observable<LeaveBalance[]> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    return this.http.get<LeaveBalance[]>(this.baseUrl, { params });
  }

  adjust(id: number, dto: AdjustLeaveBalanceDto): Observable<LeaveBalance> {
    return this.http.patch<LeaveBalance>(`${this.baseUrl}/${id}/adjust`, dto);
  }

  recompute(employeeId: number, year: number): Observable<LeaveBalance[]> {
    return this.http.post<LeaveBalance[]>(`${this.baseUrl}/recompute`, { employeeId, year });
  }
}
