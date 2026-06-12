import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FeatureImportance {
  name: string;
  importance: number;
}

export interface PredictionResult {
  prediction: string;
  employeeId: number;
  riskProba: number; // 0.0 → 1.0
  riskLevel: RiskLevel;
  riskLabel: string;
  topFeatures: FeatureImportance[];
  thresholds: { high: number; medium: number };
}

/** Réponse brute Flask (snake_case) pour un risque absentéisme. */
export interface FlaskAbsenteismeRisk {
  employee_id: number;
  risk_proba: number;
  risk_level: RiskLevel;
  risk_label: string;
}

@Injectable({ providedIn: 'root' })
export class PredictionService {
  private readonly apiUrl = 'http://localhost:8080/api/predictions';
  private readonly flaskUrl = 'http://localhost:5001';

  constructor(private http: HttpClient) {}

  /** P1 — Risque d'absentéisme d'un employé sur les 30 prochains jours. */
  getAbsenteeismRisk(employeeId: number): Observable<PredictionResult> {
    return this.http.get<PredictionResult>(`${this.apiUrl}/absenteisme/${employeeId}`);
  }

  /** P3 — Risque de non-atteinte d'un objectif OKR avant sa deadline. */
  getOkrRisk(objectiveId: number): Observable<PredictionResult> {
    return this.http.get<PredictionResult>(`${this.apiUrl}/okr/${objectiveId}`);
  }

  /** P2 — Risque de burnout d'un employé. */
  getBurnoutRisk(employeeId: number): Observable<PredictionResult> {
    return this.http.get<PredictionResult>(`${this.apiUrl}/burnout/${employeeId}`);
  }

  /**
   * P1 — Risques absentéisme pour tous les employés.
   * Tente d'abord GET Flask /predict/absenteisme/all, sinon forkJoin via le proxy Spring.
   */
  getAllEmployeesAbsenteismeRisk(employeeIds: number[]): Observable<PredictionResult[]> {
    return this.http.get<FlaskAbsenteismeRisk[]>(`${this.flaskUrl}/predict/absenteisme/all`).pipe(
      map((items) => (items ?? []).map((item) => this.mapFlaskRisk(item))),
      catchError(() => this.fetchAbsenteismeRisksForkJoin(employeeIds))
    );
  }

  private fetchAbsenteismeRisksForkJoin(employeeIds: number[]): Observable<PredictionResult[]> {
    if (!employeeIds.length) {
      return of([]);
    }
    return forkJoin(
      employeeIds.map((id) =>
        this.getAbsenteeismRisk(id).pipe(catchError(() => of(null as PredictionResult | null)))
      )
    ).pipe(
      map((results) => results.filter((r): r is PredictionResult => r !== null))
    );
  }

  private mapFlaskRisk(item: FlaskAbsenteismeRisk): PredictionResult {
    return {
      prediction: 'absenteisme',
      employeeId: item.employee_id,
      riskProba: item.risk_proba,
      riskLevel: item.risk_level,
      riskLabel: item.risk_label,
      topFeatures: [],
      thresholds: { high: 0.65, medium: 0.35 }
    };
  }
}
