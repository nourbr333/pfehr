import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LeavePolicy } from '../absences-conges.models';

@Injectable({ providedIn: 'root' })
export class LeavePolicyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api/leave-policies';

  getAll(): Observable<LeavePolicy[]> {
    return this.http.get<LeavePolicy[]>(this.baseUrl);
  }

  update(id: number, dto: Partial<LeavePolicy>): Observable<LeavePolicy> {
    return this.http.patch<LeavePolicy>(`${this.baseUrl}/${id}`, dto);
  }
}
