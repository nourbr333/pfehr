import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from './auth';

export type NotificationType =
  | 'conge'
  | 'absence'
  | 'employe'
  | 'employe_embauche'
  | 'employe_equipe'
  | 'performance'
  | 'reunion'
  | 'systeme'
  | 'avertissement'
  | 'validation'
  | 'expired'
  | 'relance_eval'
  | 'invitation_equipe';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  targetUrl?: string;
}

interface NotificationApiItem {
  id: number;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  targetUrl?: string;
}

const KNOWN_TYPES = new Set<NotificationType>([
  'conge', 'absence', 'employe', 'employe_embauche', 'employe_equipe',
  'performance', 'reunion', 'systeme', 'avertissement', 'validation',
  'expired', 'relance_eval', 'invitation_equipe'
]);

function normalizeNotificationType(type: string): NotificationType {
  if (KNOWN_TYPES.has(type as NotificationType)) {
    return type as NotificationType;
  }
  if (type === 'employe') return 'employe_embauche';
  return 'systeme';
}

export interface CreateNotificationPayload {
  type: string;
  title: string;
  message: string;
  recipientId: number | null;
  sourceTable: string;
  sourceId: number;
  targetUrl: string;
  targetRole?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly apiUrl = 'http://localhost:8080/api/notifications';
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  readonly notifications$ = this.notificationsSubject.asObservable();
  private pollSub?: Subscription;

  constructor(private http: HttpClient, private authService: AuthService) {
    this.loadFromApi();
    // Poll every 30 seconds so the RH panel updates automatically
    this.pollSub = interval(30000).subscribe(() => this.loadFromApi());
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  get unreadCount(): number {
    return this.notificationsSubject.value.filter(n => !n.read).length;
  }

  markAsRead(id: number): void {
    if (!this.authService.getSsoToken()) return;
    this.http.patch(`${this.apiUrl}/${id}/read`, {}).pipe(catchError(() => of(null))).subscribe();
    const updated = this.notificationsSubject.value.map(n =>
      n.id === id ? { ...n, read: true } : n
    );
    this.notificationsSubject.next(updated);
  }

  markAllAsRead(): void {
    if (!this.authService.getSsoToken()) return;
    this.http.patch(`${this.apiUrl}/read-all`, {}).pipe(catchError(() => of(null))).subscribe();
    const updated = this.notificationsSubject.value.map(n => ({ ...n, read: true }));
    this.notificationsSubject.next(updated);
  }

  /** Re-fetch notifications from the API (call after KPI threshold check). */
  refresh(): void {
    this.loadFromApi();
  }

  private loadFromApi(): void {
    if (!this.authService.getSsoToken()) {
      this.notificationsSubject.next([]);
      return;
    }
    this.http.get<NotificationApiItem[]>(this.apiUrl).pipe(
      catchError(() => of([] as NotificationApiItem[]))
    ).subscribe(items => {
      this.notificationsSubject.next(items.map(item => ({
        id: item.id,
        type: normalizeNotificationType(item.type),
        title: item.title,
        message: item.message,
        timestamp: new Date(item.createdAt),
        read: item.read,
        targetUrl: item.targetUrl
      })));
    });
  }

  createNotification(payload: CreateNotificationPayload): Observable<AppNotification> {
    return this.http.post<NotificationApiItem>(this.apiUrl, payload).pipe(
      map(item => ({
        id: item.id,
        type: normalizeNotificationType(item.type),
        title: item.title,
        message: item.message,
        timestamp: new Date(item.createdAt),
        read: item.read,
        targetUrl: item.targetUrl
      } as AppNotification))
    );
  }

}
