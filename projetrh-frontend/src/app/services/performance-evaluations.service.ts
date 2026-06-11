import { Injectable } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Employee, EmployeeService } from './employee.service';
import { EmployeeEvaluation, EvaluationService } from './evaluation.service';

export const EVALUATION_OVERDUE_DAYS = 90;

export type EvaluationStatus = 'Complété' | 'En cours' | 'En retard';
export type EvaluationTrend = 'up' | 'down' | 'stable';

export interface PerformanceEvaluationCycle {
  cycleId: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  managerName: string;
  hasManager: boolean;
  departmentName: string;
  jobTitle: string;
  lastEvaluationDate: string;
  score: number;
  status: EvaluationStatus;
  trend: EvaluationTrend;
  neverEvaluated: boolean;
  period: string | null;
  objectifs: string | null;
  comments: string | null;
  evaluationHistory: { date: string; score: number }[];
}

@Injectable({ providedIn: 'root' })
export class PerformanceEvaluationsService {
  constructor(
    private employeeService: EmployeeService,
    private evaluationService: EvaluationService
  ) {}

  /**
   * Source de donnees "BDD-first":
   * - recupere les employes
   * - recupere leurs evaluations depuis employee_evaluations
   * - inclut les employes jamais evalues (statut En retard)
   */
  getEvaluationCycles(): Observable<PerformanceEvaluationCycle[]> {
    return this.employeeService.getAllEmployees().pipe(
      map((employees) => (employees ?? []).filter((e) => e.isManager !== true)),
      switchMap((employees) => this.buildCyclesFromEvaluations(employees)),
      catchError(() => of([]))
    );
  }

  private buildCyclesFromEvaluations(employees: Employee[]): Observable<PerformanceEvaluationCycle[]> {
    if (!employees.length) return of([]);

    const employeeById = new Map<number, Employee>();
    employees.forEach((employee) => employeeById.set(employee.employeeId, employee));

    return forkJoin(
      employees.map((employee) =>
        this.evaluationService.listByEmployeeId(employee.employeeId).pipe(
          map((evaluations) => ({ employee, evaluations })),
          catchError(() => of({ employee, evaluations: [] as EmployeeEvaluation[] }))
        )
      )
    ).pipe(
      map((rows) =>
        rows.map(({ employee, evaluations }) =>
          this.toCycle(employee, evaluations, employeeById)
        )
      )
    );
  }

  private toCycle(
    employee: Employee,
    evaluations: EmployeeEvaluation[],
    employeeById: Map<number, Employee>
  ): PerformanceEvaluationCycle {
    if (!evaluations.length) {
      return {
        cycleId: employee.employeeId,
        employeeId: employee.employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeAvatar: this.initials(employee.firstName, employee.lastName),
        managerName: this.resolveManagerName(employee, employeeById),
        hasManager: employee.managerId != null,
        departmentName: employee.departmentName || 'Non assigne',
        jobTitle: employee.jobTitle || 'Poste non renseigne',
        lastEvaluationDate: '',
        score: 0,
        status: 'En retard',
        trend: 'stable',
        neverEvaluated: true,
        period: null,
        objectifs: null,
        comments: null,
        evaluationHistory: []
      };
    }

    const sorted = [...evaluations].sort(
      (left, right) => this.dateValue(right.evaluatedAt) - this.dateValue(left.evaluatedAt)
    );
    const latest = sorted[0];
    const previous = sorted[1];
    const score = this.normalizeScore(latest.rating);

    return {
      cycleId: latest.evaluationId || Number(`${employee.employeeId}${this.dateValue(latest.evaluatedAt)}`),
      employeeId: employee.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeAvatar: this.initials(employee.firstName, employee.lastName),
      managerName: this.resolveManagerName(employee, employeeById, latest.managerId),
      hasManager: employee.managerId != null,
      departmentName: employee.departmentName || 'Non assigne',
      jobTitle: employee.jobTitle || 'Poste non renseigne',
      lastEvaluationDate: this.normalizeDate(latest.evaluatedAt),
      score,
      status: this.computeStatus(latest.evaluatedAt, latest.rating),
      trend: this.computeTrend(score, previous?.rating),
      neverEvaluated: false,
      period: latest.period ?? null,
      objectifs: latest.objectifs ?? latest.summary ?? null,
      comments: latest.comments ?? null,
      evaluationHistory: sorted
        .filter((e) => e.rating != null && this.normalizeScore(e.rating) > 0)
        .map((e) => ({ date: this.normalizeDate(e.evaluatedAt), score: this.normalizeScore(e.rating!) }))
    };
  }

  private resolveManagerName(
    employee: Employee,
    employeeById: Map<number, Employee>,
    evaluationManagerId?: number | null
  ): string {
    const managerId = evaluationManagerId ?? employee.managerId;
    if (managerId == null) return 'Sans manager';
    const manager = employeeById.get(managerId);
    if (manager) return `${manager.firstName} ${manager.lastName}`.trim();
    return `Manager #${managerId}`;
  }

  private computeStatus(evaluatedAt: string, rating: number | null | undefined): EvaluationStatus {
    const evaluationDate = new Date(`${this.normalizeDate(evaluatedAt)}T00:00:00`);
    if (Number.isNaN(evaluationDate.getTime())) return 'En cours';

    if (this.isOverdue(evaluationDate)) return 'En retard';
    if (rating != null) return 'Complété';
    return 'En cours';
  }

  private isOverdue(evaluationDate: Date): boolean {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - EVALUATION_OVERDUE_DAYS);
    threshold.setHours(0, 0, 0, 0);
    return evaluationDate < threshold;
  }

  private computeTrend(latestRating: number, previousRating?: number | null): EvaluationTrend {
    if (previousRating == null) return 'stable';
    const previous = this.normalizeScore(previousRating);
    if (latestRating > previous) return 'up';
    if (latestRating < previous) return 'down';
    return 'stable';
  }

  private initials(firstName: string, lastName: string): string {
    const first = (firstName?.[0] ?? '').toUpperCase();
    const last = (lastName?.[0] ?? '').toUpperCase();
    return `${first}${last}` || '--';
  }

  private normalizeDate(value: string | null | undefined): string {
    if (!value) return '';
    return value.slice(0, 10);
  }

  private dateValue(value: string | null | undefined): number {
    const normalized = this.normalizeDate(value);
    if (!normalized) return 0;
    const ms = new Date(`${normalized}T00:00:00`).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  private normalizeScore(value: number | null | undefined): number {
    if (value == null || Number.isNaN(Number(value))) return 0;
    return Math.max(0, Math.min(100, Math.round(Number(value))));
  }
}
