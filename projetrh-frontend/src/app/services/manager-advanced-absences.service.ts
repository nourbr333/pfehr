import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type AdvancedAbsenceViewMode = 'monthly' | 'weekly';
export type AdvancedAbsenceType = 'conge-paye' | 'maladie' | 'sans-solde' | 'evenement-familial' | 'autre';
export type AdvancedAbsenceStatus = 'en_attente' | 'approuvee' | 'refusee';

export interface CalendarAbsenceItem {
  requestId: number;
  employeeId: number;
  employeeName: string;
  roleLabel: string;
  absenceType: AdvancedAbsenceType;
  status: AdvancedAbsenceStatus;
  startDate: string;
  endDate: string;
  criticalRole: boolean;
  backupAssigned: boolean;
  backupEmployeeName: string | null;
}

export interface CoverageAlertItem {
  alertType: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  day: string | null;
  requestId: number | null;
  impactedCount: number;
}

export interface AffectedMemberItem {
  employeeId: number;
  employeeName: string;
  absenceStart: string;
  absenceEnd: string;
  absenceType: string;
}

export interface ProjectImpactItem {
  objectiveId: number;
  objectiveCode: string;
  objectiveTitle: string;
  itemType: 'projet' | 'tache';
  riskStatus: string;
  ownerName: string;
  relatedRequestId: number | null;
  absenceStart: string | null;
  absenceEnd: string | null;
  impactReason: string;
  // Cross-module enrichment
  progressPercent?: number;
  delayDays?: number;
  dueDate?: string;
  affectedMembersCount?: number;
  totalMembersCount?: number;
  capacityRiskPercent?: number;
  affectedMembers?: AffectedMemberItem[];
  // Backup coverage
  backupAssigned?: boolean;
  backupName?: string | null;
}

export interface CrossAffectedMemberItem {
  employeeId: number;
  employeeName: string;
  absenceStart: string;
  absenceEnd: string;
  absenceType: string;
  relatedRequestId: number;
}

export interface ObjectiveAbsenceImpactItem {
  objectiveId: number;
  objectiveCode: string;
  objectiveTitle: string;
  dueDate: string;
  progressPercent: number;
  delayDays: number;
  riskStatus: string;
  scope: 'TEAM' | 'INDIVIDUAL';
  totalMembers: number;
  affectedMembersCount: number;
  capacityRiskPercent: number;
  affectedMembers: CrossAffectedMemberItem[];
}

export interface ManagerCrossAnalysis {
  objectiveAbsenceImpacts: ObjectiveAbsenceImpactItem[];
}

export interface PipelineRequestItem {
  requestId: number;
  employeeId: number;
  employeeName: string;
  absenceType: AdvancedAbsenceType;
  status: AdvancedAbsenceStatus;
  startDate: string;
  endDate: string;
  reason: string;
  requestedAt: string;
  conflictsDetected: boolean;
}

export interface EmployeeChoiceItem {
  employeeId: number;
  employeeName: string;
  roleLabel: string;
}

export interface AdvancedAbsenceDashboard {
  viewMode: AdvancedAbsenceViewMode;
  periodStart: string;
  periodEnd: string;
  simultaneousAbsenceThreshold: number;
  totalTeamMembers: number;
  activeApprovedAbsences: number;
  cumulativeAbsenceDays: number;
  prevMonthAbsenceDays: number;
  prevMonthAbsenceRate: number;
  attendanceAbsenceRate?: number;
  prevAttendanceAbsenceRate?: number;
  calendarAbsences: CalendarAbsenceItem[];
  coverageAlerts: CoverageAlertItem[];
  projectImpacts: ProjectImpactItem[];
  pipeline: {
    pendingCount: number;
    approvedCount: number;
    refusedCount: number;
    requests: PipelineRequestItem[];
  };
  teamBackups: EmployeeChoiceItem[];
}

export interface SuggestAlternativesPayload {
  requestId: number;
  preferredStartDate?: string;
  preferredEndDate?: string;
  searchWindowDays?: number;
  maxAlternatives?: number;
}

export interface SuggestedAlternative {
  startDate: string;
  endDate: string;
  simultaneousAbsences: number;
  note: string;
}

export interface SuggestedAlternativesResponse {
  requestId: number;
  requestedStartDate: string;
  requestedEndDate: string;
  alternatives: SuggestedAlternative[];
}

export interface CreateContinuityPlanPayload {
  requestId: number;
  backupEmployeeId?: number;
  notes?: string;
}

export interface ContinuityPlanResult {
  planId: number;
  requestId: number;
  employeeId: number;
  employeeName: string;
  backupEmployeeId: number | null;
  backupEmployeeName: string | null;
  status: string;
  notes: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ManagerAdvancedAbsencesService {
  private readonly baseUrl = 'http://localhost:8080/api/managers';

  constructor(private http: HttpClient) {}

  getDashboard(
    managerId: number,
    viewMode: AdvancedAbsenceViewMode,
    referenceDate: string,
    threshold = 2
  ): Observable<AdvancedAbsenceDashboard> {
    const params = new HttpParams()
      .set('viewMode', viewMode)
      .set('referenceDate', referenceDate)
      .set('threshold', String(threshold));
    return this.http.get<AdvancedAbsenceDashboard>(`${this.baseUrl}/${managerId}/advanced-absences/dashboard`, { params });
  }

  suggestAlternatives(managerId: number, payload: SuggestAlternativesPayload): Observable<SuggestedAlternativesResponse> {
    return this.http.post<SuggestedAlternativesResponse>(
      `${this.baseUrl}/${managerId}/advanced-absences/suggest-alternatives`,
      payload
    );
  }

  createContinuityPlan(managerId: number, payload: CreateContinuityPlanPayload): Observable<ContinuityPlanResult> {
    return this.http.post<ContinuityPlanResult>(`${this.baseUrl}/${managerId}/advanced-absences/continuity-plans`, payload);
  }

  getContinuityPlans(managerId: number): Observable<ContinuityPlanResult[]> {
    return this.http.get<ContinuityPlanResult[]>(`${this.baseUrl}/${managerId}/advanced-absences/continuity-plans`);
  }
}
