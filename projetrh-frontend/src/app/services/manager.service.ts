import { Injectable } from '@angular/core';
import { forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Utilisateur } from './auth';
import { Attendance, AttendanceService } from './attendance.service';
import { Employee, EmployeeService } from './employee.service';
import {
  CreateEmployeeEvaluationPayload,
  EmployeeEvaluation,
  EvaluationService
} from './evaluation.service';

export interface ManagerTeamMember {
  id: string;
  name: string;
  email?: string;
  job_title?: string;
  department?: string;
  department_id?: number;
  hire_date?: string;
  performance_score: number;
  attendance_rate: number;
  absences_days: number;
  late_rate: number;
  late_days: number;
  overtime_hours: number;
}

export interface ManagerTeamData {
  manager_id: string;
  team: ManagerTeamMember[];
}

export interface Evaluation {
  evaluationId?: number;
  date: string;
  periode?: string;
  score: number;
  evaluateur: string;
  commentaire: string;
  objectifs: string;
}

@Injectable({ providedIn: 'root' })
export class ManagerService {
  private managerData: ManagerTeamData = { manager_id: '', team: [] };
  private dbEvaluationsByEmployee: Record<string, Evaluation[]> = {};

  constructor(
    private employeeService: EmployeeService,
    private attendanceService: AttendanceService,
    private evaluationService: EvaluationService
  ) {}

  resolveManagerEmployeeId(user: Pick<Utilisateur, 'email' | 'employeeId'> | null | undefined): number | null {
    if (!user) return null;
    if (typeof user.employeeId === 'number') return user.employeeId;
    return null;
  }

  loadTeamForManager(managerEmployeeId: number): Observable<ManagerTeamMember[]> {
    return this.employeeService.getAllEmployees().pipe(
      map((employees) => (employees ?? []).filter((employee) => employee.managerId === managerEmployeeId)),
      switchMap((teamEmployees) => {
        this.dbEvaluationsByEmployee = {};

        if (!teamEmployees.length) {
          this.managerData = { manager_id: String(managerEmployeeId), team: [] };
          return of([]);
        }

        return forkJoin({
          allAttendance: this.attendanceService.getAll().pipe(catchError(() => of([] as Attendance[]))),
          evaluationsByEmployee: forkJoin(
            teamEmployees.map((e) => this.evaluationService.listByEmployeeId(e.employeeId).pipe(catchError(() => of([]))))
          )
        }).pipe(
          map(({ allAttendance, evaluationsByEmployee }) => {
            const rowsByEmployee = new Map<number, Attendance[]>();
            for (const row of allAttendance) {
              if (!rowsByEmployee.has(row.employeeId)) rowsByEmployee.set(row.employeeId, []);
              rowsByEmployee.get(row.employeeId)!.push(row);
            }
            const members = teamEmployees.map((employee, index) => {
              const attendanceRows = rowsByEmployee.get(employee.employeeId) ?? [];
              const evaluations = evaluationsByEmployee[index].map((e) => this.toEvaluation(e));
              this.dbEvaluationsByEmployee[String(employee.employeeId)] = evaluations;
              return this.buildMember(employee, attendanceRows, evaluations);
            });
            this.managerData = { manager_id: String(managerEmployeeId), team: members };
            return structuredClone(members);
          })
        );
      })
    );
  }

  getManagerData(): ManagerTeamData {
    return structuredClone(this.managerData);
  }

  getTeam(): ManagerTeamMember[] {
    return structuredClone(this.managerData.team);
  }

  getTeamSize(): number {
    return this.managerData.team.length;
  }

  getAveragePerformance(): number {
    if (!this.managerData.team.length) return 0;
    const total = this.managerData.team.reduce((sum, m) => sum + m.performance_score, 0);
    return Math.round((total / this.managerData.team.length) * 10) / 10;
  }

  getAverageAttendance(): number {
    if (!this.managerData.team.length) return 0;
    const total = this.managerData.team.reduce((sum, m) => sum + m.attendance_rate, 0);
    return Math.round((total / this.managerData.team.length) * 10) / 10;
  }

  getTotalAbsentDays(): number {
    return this.managerData.team.reduce((sum, m) => sum + m.absences_days, 0);
  }

  // --- Mon Équipe helpers ---

  upsertMember(member: ManagerTeamMember): void {
    const index = this.managerData.team.findIndex(m => m.id === member.id);
    if (index >= 0) {
      this.managerData.team[index] = { ...member };
    } else {
      this.managerData.team.push({ ...member });
    }
  }

  deleteMember(id: string): void {
    this.managerData.team = this.managerData.team.filter(m => m.id !== id);
    delete this.dbEvaluationsByEmployee[id];
  }

  getEvaluationsFor(id: string): Evaluation[] {
    const key = String(id);
    return structuredClone(this.dbEvaluationsByEmployee[key] ?? []);
  }

  reloadEvaluationsFor(id: string): Observable<Evaluation[]> {
    const key = String(id);
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId)) {
      return throwError(() => new Error('Identifiant employe invalide.'));
    }

    return this.evaluationService.listByEmployeeId(employeeId).pipe(
      map((rows) => rows.map((evaluation) => this.toEvaluation(evaluation))),
      map((mapped) => {
        this.dbEvaluationsByEmployee[key] = mapped;
        return structuredClone(mapped);
      })
    );
  }

  addEvaluation(id: string, managerId: number, evaluation: Evaluation): Observable<Evaluation> {
    const key = String(id);
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId)) {
      return throwError(() => new Error('Identifiant employe invalide.'));
    }

    const payload: CreateEmployeeEvaluationPayload = {
      managerId,
      evaluatedAt: evaluation.date || undefined,
      period: null,
      objectifs: evaluation.objectifs || null,
      comments: evaluation.commentaire || null,
      rating: this.clampScore(evaluation.score)
    };

    return this.evaluationService.createForEmployee(employeeId, payload).pipe(
      map((savedEvaluation) => {
        const normalized = this.toEvaluation(savedEvaluation);
        if (!this.dbEvaluationsByEmployee[key]) {
          this.dbEvaluationsByEmployee[key] = [];
        }
        this.dbEvaluationsByEmployee[key].unshift(normalized);
        return normalized;
      })
    );
  }

  deleteEvaluation(id: string, evaluationId: number): Observable<void> {
    const key = String(id);
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId)) {
      return throwError(() => new Error('Identifiant employe invalide.'));
    }

    return this.evaluationService.deleteForEmployee(employeeId, evaluationId).pipe(
      map(() => {
        this.dbEvaluationsByEmployee[key] = (this.dbEvaluationsByEmployee[key] ?? [])
          .filter((evaluation) => evaluation.evaluationId !== evaluationId);
      })
    );
  }

  private buildMember(employee: Employee, attendanceRows: Attendance[], evaluations: Evaluation[]): ManagerTeamMember {
    const totalDays = attendanceRows.length;
    const presentDays = attendanceRows.filter(r => r.isPresent).length;
    const lateDays = attendanceRows.filter(r => r.isLate).length;
    const overtimeHours = attendanceRows.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0);

    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : 0;
    const absencesDays = totalDays - presentDays;
    const lateRate = totalDays > 0 ? Math.round((lateDays / totalDays) * 1000) / 10 : 0;
    const performanceScore = evaluations.length ? this.averageScore(evaluations) : 0;

    return {
      id: String(employee.employeeId),
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: (employee.email ?? '').trim() || undefined,
      job_title: employee.jobTitle,
      department: employee.departmentName,
      department_id: employee.departmentId,
      hire_date: employee.hireDate || undefined,
      performance_score: performanceScore,
      attendance_rate: attendanceRate,
      absences_days: absencesDays,
      late_rate: lateRate,
      late_days: lateDays,
      overtime_hours: Math.round(overtimeHours * 10) / 10
    };
  }

  private toEvaluation(evaluation: EmployeeEvaluation): Evaluation {
    const score = evaluation.rating == null ? 0 : this.clampScore(evaluation.rating);
    const objectifs = evaluation.objectifs?.trim() || evaluation.summary?.trim() || '—';
    const periode = evaluation.period?.trim() || (evaluation.evaluatedAt ?? '');
    return {
      evaluationId: evaluation.evaluationId ?? undefined,
      date: evaluation.evaluatedAt ?? '',
      periode: periode || '—',
      score,
      evaluateur: evaluation.managerId ? `Manager #${evaluation.managerId}` : 'Manager',
      commentaire: evaluation.comments?.trim() || '—',
      objectifs
    };
  }

  private averageScore(evaluations: Evaluation[]): number {
    if (!evaluations.length) return 0;
    const total = evaluations.reduce((sum, current) => sum + this.clampScore(current.score), 0);
    return Math.round(total / evaluations.length);
  }

  private clampScore(value: number): number {
    const safeValue = Number(value);
    if (!Number.isFinite(safeValue)) return 0;
    return Math.max(0, Math.min(100, Math.round(safeValue)));
  }
}

