import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type CalendarEventType = 'conge' | 'reunion' | 'rappel' | 'formation' | 'tache' | 'autre';
export type CalendarEventTargetType =
  | 'manager_team'
  | 'manager_specific'
  | 'rh_company'
  | 'rh_department'
  | 'rh_job_title'
  | 'rh_specific';

export interface CalendarEvent {
  eventId: number;
  title: string;
  description?: string | null;
  eventDate: string;
  eventTime?: string | null;
  eventType: CalendarEventType;
  targetType: CalendarEventTargetType;
  targetDepartmentId?: number | null;
  targetJobTitle?: string | null;
  targetEmployeeIds?: number[];
  createdByEmployeeId?: number | null;
  createdByName?: string | null;
  createdByRole?: string | null;
  annule?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertCalendarEventPayload {
  title: string;
  description?: string;
  eventDate: string;
  eventTime?: string | null;
  eventType: CalendarEventType;
  targetType: CalendarEventTargetType;
  targetDepartmentId?: number | null;
  targetJobTitle?: string | null;
  targetEmployeeIds?: number[];
  createdByEmployeeId?: number | null;
  createdByName?: string | null;
  createdByRole?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly apiUrl = 'http://localhost:8080/api/events';

  constructor(private http: HttpClient) {}

  getVisibleEvents(input: { from: string; to: string }): Observable<CalendarEvent[]> {
    const params = new HttpParams().set('from', input.from).set('to', input.to);
    return this.http.get<CalendarEvent[]>(this.apiUrl, { params });
  }

  addEvent(payload: UpsertCalendarEventPayload): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>(this.apiUrl, payload);
  }

  updateEvent(eventId: number, payload: UpsertCalendarEventPayload): Observable<CalendarEvent> {
    return this.http.put<CalendarEvent>(`${this.apiUrl}/${eventId}`, payload);
  }

  deleteEvent(eventId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${eventId}`);
  }
}
