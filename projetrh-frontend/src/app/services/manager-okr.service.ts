import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type ObjectiveRiskStatus = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
export type ObjectiveScope = 'TEAM' | 'INDIVIDUAL';
export type ObjectiveActionType = 'REPLAN' | 'ESCALATE' | 'CAPACITY_REINFORCEMENT';

export interface ManagerObjective {
  objectiveId: number;
  objectiveCode: string;
  title: string;
  objectiveScope: ObjectiveScope;
  ownerEmployeeId: number;
  ownerName: string;
  managerId: number;
  managerName: string;
  /** All member employee IDs for TEAM-scope objectives */
  memberEmployeeIds: number[];
  /** All member names for TEAM-scope objectives */
  memberNames: string[];
  teamName: string;
  horizonLabel: string;
  dueDate: string;
  progressPercent: number;
  weighting: number;
  riskStatus: ObjectiveRiskStatus;
  riskReason: string | null;
  delayDays: number;
  lastUpdateAt: string;
  dependencies: string[];
}

export interface ManagerObjectiveMilestone {
  milestoneId: number;
  objectiveId: number;
  objectiveCode: string | null;
  objectiveTitle: string;
  ownerName: string;
  label: string;
  plannedDate: string;
  actualDate: string | null;
  status: string;
  varianceDays: number;
}

export interface ManagerOkrDashboard {
  objectives: ManagerObjective[];
  milestones: ManagerObjectiveMilestone[];
}

export interface CreateObjectivePayload {
  objectiveCode?: string;
  title: string;
  objectiveScope: ObjectiveScope;
  ownerEmployeeId: number;
  memberEmployeeIds?: number[];
  horizonLabel: string;
  dueDate: string;
  progressPercent?: number;
  weighting?: number;
  dependencies?: string[];
}

export interface UpdateObjectiveProgressPayload {
  authorEmployeeId: number;
  progressPercent?: number;
  commentText?: string;
}

export interface CreateActionPlanPayload {
  actionType: ObjectiveActionType;
  title: string;
  details?: string;
  ownerEmployeeId?: number;
  dueDate?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'DONE';
}

// ─── Import interfaces ────────────────────────────────────────────────────────

export interface OkrImportRow {
  rowIndex: number;
  title: string | null;
  objectiveScope: string | null;
  ownerEmployeeId: number | null;
  memberEmployeeIds: number[] | null;
  ownerName: string | null;
  horizonLabel: string | null;
  dueDate: string | null;
  /** Optionnel — date de début réelle pour imports historiques (YYYY-MM-DD). */
  createdAt: string | null;
  progressPercent: number | null;
  weighting: number | null;
  dependencies: string | null;
  valid: boolean;
  errors: string[];
}

export interface OkrImportPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: OkrImportRow[];
}

export interface OkrImportSummary {
  insertedRows: number;
  skippedRows: number;
  skippedTitles: string[];
}

export interface UpdateObjectivePayload {
  title?: string;
  objectiveScope?: ObjectiveScope;
  ownerEmployeeId?: number;
  horizonLabel?: string;
  dueDate?: string;
  progressPercent?: number;
  weighting?: number;
  dependencies?: string[];
}

@Injectable({ providedIn: 'root' })
export class ManagerOkrService {
  private readonly baseUrl = 'http://localhost:8080/api/managers';

  constructor(private http: HttpClient) {}

  getDashboard(managerId: number): Observable<ManagerOkrDashboard> {
    return this.http.get<any>(`${this.baseUrl}/${managerId}/okr/dashboard`).pipe(
      map((raw) => ({
        objectives: (raw?.objectives ?? []).map((item: any) => this.mapObjective(item)),
        milestones: (raw?.milestones ?? []).map((item: any) => this.mapMilestone(item))
      }))
    );
  }

  getAllObjectives(): Observable<ManagerOkrDashboard> {
    return this.http.get<any>(`${this.baseUrl}/okr/all-objectives`).pipe(
      map((raw) => ({
        objectives: (raw?.objectives ?? []).map((item: any) => this.mapObjective(item)),
        milestones: (raw?.milestones ?? []).map((item: any) => this.mapMilestone(item))
      }))
    );
  }

  createObjective(managerId: number, payload: CreateObjectivePayload): Observable<ManagerObjective> {
    return this.http
      .post<any>(`${this.baseUrl}/${managerId}/okr/objectives`, payload)
      .pipe(map((raw) => this.mapObjective(raw)));
  }

  updateObjectiveProgress(
    managerId: number,
    objectiveId: number,
    payload: UpdateObjectiveProgressPayload
  ): Observable<ManagerObjective> {
    return this.http
      .post<any>(`${this.baseUrl}/${managerId}/okr/objectives/${objectiveId}/progress`, payload)
      .pipe(map((raw) => this.mapObjective(raw)));
  }

  createActionPlan(managerId: number, objectiveId: number, payload: CreateActionPlanPayload): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${managerId}/okr/objectives/${objectiveId}/action-plans`, payload);
  }

  /** Step 1: upload file, get validated preview rows — nothing inserted. */
  previewImport(managerId: number, file: File): Observable<OkrImportPreviewResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<OkrImportPreviewResult>(
      `${this.baseUrl}/${managerId}/okr/objectives/preview-import`,
      formData
    );
  }

  /** Step 2: commit user-validated rows — inserts into DB. */
  commitImport(managerId: number, rows: OkrImportRow[]): Observable<OkrImportSummary> {
    return this.http.post<OkrImportSummary>(
      `${this.baseUrl}/${managerId}/okr/objectives/commit-import`,
      { rows }
    );
  }

  updateObjective(managerId: number, objectiveId: number, payload: UpdateObjectivePayload): Observable<ManagerObjective> {
    return this.http
      .put<any>(`${this.baseUrl}/${managerId}/okr/objectives/${objectiveId}`, payload)
      .pipe(map((raw) => this.mapObjective(raw)));
  }

  deleteObjective(managerId: number, objectiveId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${managerId}/okr/objectives/${objectiveId}`);
  }

  private mapObjective(raw: any): ManagerObjective {
    return {
      objectiveId: Number(raw?.objectiveId ?? raw?.objective_id ?? 0),
      objectiveCode: String(raw?.objectiveCode ?? raw?.objective_code ?? ''),
      title: String(raw?.title ?? ''),
      objectiveScope: (raw?.objectiveScope ?? raw?.objective_scope ?? 'TEAM') as ObjectiveScope,
      ownerEmployeeId: Number(raw?.ownerEmployeeId ?? raw?.owner_employee_id ?? 0),
      ownerName: String(raw?.ownerName ?? raw?.owner_name ?? 'Collaborateur'),
      managerId: Number(raw?.managerId ?? raw?.manager_id ?? 0),
      managerName: String(raw?.managerName ?? raw?.manager_name ?? 'Manager'),
      memberEmployeeIds: Array.isArray(raw?.memberEmployeeIds) ? raw.memberEmployeeIds.map(Number) : [],
      memberNames: Array.isArray(raw?.memberNames) ? raw.memberNames.map(String) : [],
      teamName: String(raw?.teamName ?? raw?.team_name ?? 'Équipe'),
      horizonLabel: String(raw?.horizonLabel ?? raw?.horizon_label ?? ''),
      dueDate: String(raw?.dueDate ?? raw?.due_date ?? ''),
      progressPercent: Number(raw?.progressPercent ?? raw?.progress_percent ?? 0),
      weighting: Number(raw?.weighting ?? 1),
      riskStatus: (raw?.riskStatus ?? raw?.risk_status ?? 'AT_RISK') as ObjectiveRiskStatus,
      riskReason: raw?.riskReason ?? raw?.risk_reason ?? null,
      delayDays: Number(raw?.delayDays ?? raw?.delay_days ?? 0),
      lastUpdateAt: String(raw?.lastUpdateAt ?? raw?.last_update_at ?? ''),
      dependencies: Array.isArray(raw?.dependencies) ? raw.dependencies.map((dep: any) => String(dep)) : []
    };
  }

  private mapMilestone(raw: any): ManagerObjectiveMilestone {
    return {
      milestoneId: Number(raw?.milestoneId ?? raw?.milestone_id ?? 0),
      objectiveId: Number(raw?.objectiveId ?? raw?.objective_id ?? 0),
      objectiveCode: raw?.objectiveCode ?? raw?.objective_code ?? null,
      objectiveTitle: String(raw?.objectiveTitle ?? raw?.objective_title ?? ''),
      ownerName: String(raw?.ownerName ?? raw?.owner_name ?? 'Collaborateur'),
      label: String(raw?.label ?? ''),
      plannedDate: String(raw?.plannedDate ?? raw?.planned_date ?? ''),
      actualDate: raw?.actualDate ?? raw?.actual_date ?? null,
      status: String(raw?.status ?? 'PLANNED'),
      varianceDays: Number(raw?.varianceDays ?? raw?.variance_days ?? 0)
    };
  }
}
