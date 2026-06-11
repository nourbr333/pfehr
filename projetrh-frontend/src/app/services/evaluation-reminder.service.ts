import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EvaluationReminder {
  notificationId: number;
  employeeId: number;
  employeeName: string;
  managerName: string;
  sentAt: string;
  status: 'Traité' | 'Non traité';
}

@Injectable({ providedIn: 'root' })
export class EvaluationReminderService {
  private readonly http = inject(HttpClient);
  private readonly base = 'http://localhost:8080/api/evaluations/reminders';

  sendReminder(employeeId: number): Observable<EvaluationReminder> {
    return this.http.post<EvaluationReminder>(`${this.base}/${employeeId}`, {});
  }

  getHistory(): Observable<EvaluationReminder[]> {
    return this.http.get<EvaluationReminder[]>(this.base);
  }
}
