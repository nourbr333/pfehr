export type AbsenceType = 'conge-paye' | 'maladie' | 'sans-solde' | 'evenement-familial' | 'autre';

export interface DepartmentConfig {
  name: string;
  color: string;
  headcount: number;
}

export interface EmployeeProfile {
  id: number;
  fullName: string;
  avatar: string;
  department: string;
  jobTitle: string;
}

export interface AbsenceEntry {
  id: number;
  employeeId: number;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason?: string;
  leaveDaysRemaining?: number;
  /** Nombre réel de jours d'absence issus du pointage badge (absencesDays de l'AttendanceRow).
   *  Distinct de la durée totale de la période (periodEnd - periodStart). */
  totalDaysActual?: number;
}

export interface AbsenceData {
  departments: DepartmentConfig[];
  employees: EmployeeProfile[];
  absences: AbsenceEntry[];
}

export type PeriodPreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
export type InstantViewTab = 'today' | 'week' | 'month';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface EnrichedAbsence {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  department: string;
  jobTitle: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  reason?: string;
  totalDays: number;
  leaveDaysRemaining?: number;
}

export interface InstantAbsenceCard {
  id: number;
  employeeName: string;
  employeeAvatar: string;
  type: AbsenceType;
  remainingLabel: string;
}

export interface DepartmentRankingItem {
  department: string;
  currentRate: number;
  previousRate: number;
  totalAbsences: number;
}

export interface EmployeeTableRow {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  department: string;
  jobTitle: string;
  absenceDays: number;
  typeBreakdown: Array<{ type: AbsenceType; days: number }>;
  absenteeismRate: number;
  previousAbsenteeismRate: number;
  presenceRate: number;
  previousPresenceRate: number;
  alert: boolean;
  recidive: boolean;
  history: EnrichedAbsence[];
}

export interface CalendarAbsenceDay {
  date: Date;
  inCurrentMonth: boolean;
  absences: EnrichedAbsence[];
  tensionDepartments: string[];
}

export interface TrendSeriesPoint {
  label: string;
  currentValue: number;
  previousValue: number;
}

export type TypeColorMap = Record<AbsenceType, { bg: string; text: string; label: string }>;

export type DepartmentMap = Record<string, DepartmentConfig>;

// ─── Leave Management Types ───────────────────────────────────────────────────

export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeAvatar?: string;
  department?: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  requestedDays: number;
  status: LeaveStatus;
  requestedAt: string;
  reviewedBy?: number;
  reviewedAt?: string;
  rejectionReason?: string;
  notes?: string;
  conflictsDetected: boolean;
  conflictDetails?: LeaveConflict[];
}

export interface LeaveConflict {
  department: string;
  overlappingEmployees: string[];
  absenceCount: number;
  departmentHeadcount: number;
  absenceRate: number;
  exceedsThreshold: boolean;
}

export interface LeaveBalance {
  id: number;
  employeeId: number;
  employeeName?: string;
  type: 'conge-paye';
  year: number;
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
  carryOver: number;
  expiresAt?: string;
}

export interface LeavePolicy {
  id: number;
  type: AbsenceType;
  label: string;
  maxDaysPerYear: number;
  requiresDocument: boolean;
  color: string;
  isActive: boolean;
}

export interface BradfordScore {
  employeeId: number;
  employeeName?: string;
  department?: string;
  score: number;
  occurrences: number;
  totalDays: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface AdvancedAnalytics {
  absenteeismCost: number;
  avgAbsenceDuration: number;
  leaveConsumptionRate: number;
  bradfordScores: BradfordScore[];
  departmentRanking: DepartmentRankingItem[];
  recidivists: BradfordScore[];
}

export interface LeaveRequestForm {
  employeeId: number | null;
  type: AbsenceType | '';
  startDate: string;
  endDate: string;
  notes: string;
  requestedDays: number;
  balanceAfter: number | null;
}

export interface CreateLeaveRequestDto {
  employeeId: number;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface UpdateLeaveRequestStatusDto {
  status: 'approved' | 'rejected' | 'cancelled';
  rejectionReason?: string;
}

export interface AdjustLeaveBalanceDto {
  adjustment: number;
  reason: string;
}
