import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthService } from './auth';
import { isKpiKey, KpiKey } from '../models/kpi-threshold.config';

export interface KpiThreshold {
  id: number;
  userId: number;
  kpiKey: string;
  kpiLabel: string | null;
  periodLabel: string | null;
  thresholdValue: number | null;
  targetValue: number | null;
  phraseOfficielle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KpiThresholdSaveRequest {
  userId: number;
  kpiKey: string;
  kpiLabel: string;
  periodLabel: string;
  thresholdValue: number | null;
  targetValue: number | null;
  phraseOfficielle: string;
}

export interface KpiCheckEntry {
  kpiKey: string;
  currentValue: number;
}

export interface KpiThresholdCheckResult {
  kpiKey: string;
  thresholdBreached: boolean;
  targetAchieved: boolean;
  notificationMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class KpiThresholdService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly API_URL = 'http://localhost:8080/api/kpi-thresholds';

  private readonly thresholdsSubject = new BehaviorSubject<KpiThreshold[]>([]);
  readonly thresholds$ = this.thresholdsSubject.asObservable();

  private get userId(): number | undefined {
    return this.auth.utilisateur?.userId ?? undefined;
  }

  get snapshot(): KpiThreshold[] {
    return this.thresholdsSubject.value;
  }

  load(): void {
    if (this.userId == null) return;
    this.http.get<KpiThreshold[]>(this.API_URL).pipe(
      catchError(() => of([] as KpiThreshold[]))
    ).subscribe(items => this.thresholdsSubject.next(items));
  }

  getThreshold(kpiKey: string): KpiThreshold | null {
    return this.snapshot.find(t => t.kpiKey === kpiKey) ?? null;
  }

  save(request: KpiThresholdSaveRequest): Observable<KpiThreshold> {
    return this.http.post<KpiThreshold>(this.API_URL, request).pipe(
      tap(saved => {
        const existing = this.thresholdsSubject.value;
        const idx = existing.findIndex(t => t.kpiKey === saved.kpiKey);
        const updated = idx >= 0
          ? existing.map((t, i) => i === idx ? saved : t)
          : [...existing, saved];
        this.thresholdsSubject.next(updated);
      })
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`).pipe(
      tap(() => {
        this.thresholdsSubject.next(
          this.thresholdsSubject.value.filter(t => t.id !== id)
        );
      })
    );
  }

  checkBatch(entries: KpiCheckEntry[]): Observable<KpiThresholdCheckResult[]> {
    if (this.userId == null) return of([]);
    return this.http.post<KpiThresholdCheckResult[]>(
      `${this.API_URL}/check-batch`,
      { entries }
    ).pipe(catchError(() => of([] as KpiThresholdCheckResult[])));
  }

  /** Build check entries from configured thresholds and a value resolver. */
  buildCheckEntries(
    getValue: (key: KpiKey) => number,
    isReady: () => boolean = () => true
  ): KpiCheckEntry[] {
    if (!isReady()) return [];
    return this.snapshot
      .filter(t => isKpiKey(t.kpiKey))
      .map(t => ({ kpiKey: t.kpiKey, currentValue: getValue(t.kpiKey as KpiKey) }));
  }
}
