import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, OnInit, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Chart, registerables } from 'chart.js';
import { AuthService, Utilisateur } from '../../services/auth';
import { NotesRespService, NoteResp } from '../../services/notes-resp.service';
import { DashboardRhDTO, DashboardRhService } from '../../services/dashboard-rh.service';
import { Department, DepartmentService } from '../../services/department.service';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import { Workload, WorkloadService } from '../../services/workload.service';
import { ManagerOkrService, ManagerObjective } from '../../services/manager-okr.service';
import { KpiThresholdService, KpiThreshold } from '../../services/kpi-threshold.service';
import { NotificationService } from '../../services/notification.service';
import { ToastService } from '../../components/toast/toast.service';
import { KpiThresholdModalComponent } from '../../components/kpi-threshold-modal/kpi-threshold-modal.component';
import {
  KpiKey,
  isKpiKey,
  isThresholdBreached as kpiIsBreached,
  isTargetAchieved as kpiIsTargetAchieved,
  KPI_THRESHOLD_DEFINITIONS
} from '../../models/kpi-threshold.config';
import { DashboardFiltersComponent, DashboardPeriod } from './components/dashboard-filters/dashboard-filters.component';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

type Tone = 'good' | 'warn' | 'bad';
type Gender = 'H' | 'F' | 'N/A';

interface DateRange {
  start: Date;
  end: Date;
}

interface DashboardEmployeeRecord {
  employeeId: number;
  name: string;
  departmentId: number | null;
  departmentName: string;
  gender: Gender;
  age: number | null;
  yearsAtCompany: number;
  attendanceRate: number;
  absenteeismRate: number;
  lateDays: number;
  totalWorkingDays: number;
  lateRate: number;
  tasksAssigned: number;
  tasksCompleted: number;
  projectsAssigned: number;
  projectsCompleted: number;
  averageTaskCompletionTime: number;
  taskCompletionRate: number;
  projectCompletionRate: number;
  productivityScore: number;
}

@Component({
  selector: 'app-accueil-resp',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DashboardFiltersComponent, NotificationsPanelComponent, KpiThresholdModalComponent],
  templateUrl: './accueil-resp.html',
  styleUrl: './accueil-resp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccueilRespComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('departmentsCanvas') departmentsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('ageCanvas') ageCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('genderCanvas') genderCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('attendanceDeptCanvas') attendanceDeptCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('lateRateDeptCanvas') lateRateDeptCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('top5AtRiskCanvas') top5AtRiskCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('evaluationCanvas') evaluationCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('okrCompletionCanvas') okrCompletionCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('okrStatusCanvas') okrStatusCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('seniorityDistributionCanvas') seniorityDistributionCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('seniorityDeptCanvas') seniorityDeptCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('seniorityGenderCanvas') seniorityGenderCanvas?: ElementRef<HTMLCanvasElement>;

  private static chartsRegistered = false;
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly dashboardRhService = inject(DashboardRhService);
  private readonly departmentService = inject(DepartmentService);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly workloadService = inject(WorkloadService);
  private readonly okrService = inject(ManagerOkrService);
  private readonly notesService = inject(NotesRespService);
  private readonly kpiThresholdService = inject(KpiThresholdService);
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly utilisateur: Utilisateur | null = this.auth.utilisateur;
  readonly departmentColors = ['#2563EB', '#38BDF8', '#22C55E', '#F59E0B', '#A855F7', '#EF4444', '#14B8A6', '#6366F1'];
  readonly genderColors = { H: '#4A90D9', F: '#E8769A' };
  readonly seniorityBuckets = ['0-2 ans', '3-5 ans', '6-10 ans', '11-15 ans', '15+ ans'];

  data: DashboardRhDTO | null = null;
  selectedPeriod: DashboardPeriod = 'month';
  selectedDepartmentId: number | null = null;
  selectedGender: 'H' | 'F' | null = null;
  departments: Department[] = [];
  employees: Employee[] = [];
  attendanceRows: Attendance[] = [];
  workloadRows: Workload[] = [];
  okrObjectives: ManagerObjective[] = [];
  records: DashboardEmployeeRecord[] = [];
  attendanceRateAverage = 0;
  absenteeismRateAverage = 0;
  lateRateAverage = 0;
  attendanceRatePrev = 0;
  absenteeismRatePrev = 0;
  lateRatePrev = 0;
  isFilterTransitioning = false;
  noteModalOpen = false;
  noteModalKpiKey = '';
  noteModalKpiLabel = '';
  noteModalContent = '';

  // ── Threshold/Cible modal state ─────────────────────────────────────────
  thresholdModalOpen = false;
  thresholdModalKpiKey: KpiKey = 'attendance';
  thresholdModalKpiLabel = '';

  // ── Note history / comment modal state ──────────────────────────────────
  noteHistoryOpen = false;
  noteHistoryKpiKey = '';
  noteHistoryKpiLabel = '';
  noteHistoryComment = '';            // new comment being typed
  readonly kpiDefinitions: Record<string, { label: string; formula: string; target: string }> = {
    effectif:    { label: 'Effectif total',            formula: "Nombre d'collaborateurs dans la sélection active", target: 'N/A' },
    attendance:  { label: KPI_THRESHOLD_DEFINITIONS.attendance.label, formula: KPI_THRESHOLD_DEFINITIONS.attendance.formula, target: KPI_THRESHOLD_DEFINITIONS.attendance.suggestedTarget },
    absenteisme: { label: KPI_THRESHOLD_DEFINITIONS.absenteisme.label, formula: KPI_THRESHOLD_DEFINITIONS.absenteisme.formula, target: KPI_THRESHOLD_DEFINITIONS.absenteisme.suggestedTarget },
    retard:      { label: KPI_THRESHOLD_DEFINITIONS.retard.label, formula: KPI_THRESHOLD_DEFINITIONS.retard.formula, target: KPI_THRESHOLD_DEFINITIONS.retard.suggestedTarget }
  };
  private isLoadingSummary = true;
  private isLoadingReference = true;
  private readonly chartInstances: Chart[] = [];
  private readonly departmentByName = new Map<string, { id: number; name: string }>();
  private filterTransitionTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    if (!AccueilRespComponent.chartsRegistered) {
      Chart.register(...registerables);
      AccueilRespComponent.chartsRegistered = true;
    }
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.isLoadingSummary = false;
      this.isLoadingReference = false;
      return;
    }
    this.loadDepartments();
    this.loadReferenceData();
    this.loadDashboardData();
    this.loadOkrData();
    this.notesService.load();
    this.kpiThresholdService.load();
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
    if (this.filterTransitionTimer) {
      clearTimeout(this.filterTransitionTimer);
      this.filterTransitionTimer = undefined;
    }
  }

  onNotifications(): void { }
  onDeconnexion(): void { this.auth.deconnexion(); this.router.navigate(['/login']); }
  onProfil(): void { this.router.navigate(['/profil']); }

  get isLoading(): boolean { return this.isLoadingSummary || this.isLoadingReference; }
  get todayDateStr(): string { return new Date().toLocaleDateString('fr-FR'); }
  get totalEmployeeText(): string { const c = this.filteredRecords.length; return `${c} employe${c > 1 ? 's' : ''}`; }
  get selectedDepartmentName(): string | null {
    if (this.selectedDepartmentId === null) return null;
    return this.departments.find((department) => department.departmentId === this.selectedDepartmentId)?.departmentName ?? null;
  }
  get currentPeriodLabel(): string {
    return this.formatRangeLabel(this.currentRange);
  }
  get isGlobalFilterActive(): boolean { return this.selectedDepartmentId !== null || !!this.selectedGender; }
  get hasDepartmentData(): boolean { return this.departmentStats.some((i) => i.count > 0); }
  get hasAgeData(): boolean { return this.ageDistribution.some((i) => i.count > 0); }
  get hasGenderData(): boolean { return this.filteredRecords.some((i) => i.gender === 'H' || i.gender === 'F'); }
  get hasEvaluationData(): boolean { return this.filteredEvaluations.length > 0; }
  get filteredOkrObjectives(): ManagerObjective[] {
    const range = this.currentRange;
    return this.okrObjectives.filter((objective) => {
      if (!objective.dueDate) return true;
      const due = this.parseDate(objective.dueDate.slice(0, 10));
      return due >= range.start && due <= range.end;
    });
  }
  get hasOkrCompletionData(): boolean { return this.filteredOkrObjectives.length > 0; }
  get hasOkrStatusData(): boolean { return this.filteredOkrObjectives.length > 0; }
  get hasAttendanceByDeptData(): boolean { return this.filteredRecords.some((record) => record.totalWorkingDays > 0); }
  get hasLateRateByDeptData(): boolean { return this.filteredRecords.some((record) => record.totalWorkingDays > 0); }
  get top5AtRiskEmployees(): DashboardEmployeeRecord[] {
    return this.filteredRecords
      .filter((record) => record.totalWorkingDays > 0)
      .sort((a, b) => this.presenceRiskScore(b) - this.presenceRiskScore(a))
      .slice(0, 5);
  }
  get hasTop5AtRiskData(): boolean { return this.top5AtRiskEmployees.length > 0; }
  get hasSeniorityData(): boolean { return this.filteredRecords.length > 0; }
  get attendanceTone(): Tone { return this.performanceTone(this.attendanceRateAverage, 90, 75); }
  get absenteeismTone(): Tone { return this.absenteeismRateAverage < 10 ? 'good' : this.absenteeismRateAverage <= 25 ? 'warn' : 'bad'; }
  get lateRateTone(): Tone { return this.lateRateAverage > 10 ? 'bad' : this.lateRateAverage >= 5 ? 'warn' : 'good'; }

  get attendanceDelta(): number { return this.round1(this.attendanceRateAverage - this.attendanceRatePrev); }
  get absenteeismDelta(): number { return this.round1(this.absenteeismRateAverage - this.absenteeismRatePrev); }
  get lateRateDelta(): number { return this.round1(this.lateRateAverage - this.lateRatePrev); }

  get comparisonLabel(): string {
    if (this.selectedPeriod === 'year') return 'vs an préc.';
    if (this.selectedPeriod === 'quarter') return 'vs trim. préc.';
    return 'vs mois préc.';
  }

  deltaClass(higherIsBetter: boolean, delta: number): string {
    if (delta === 0) return 'tn';
    return (higherIsBetter ? delta > 0 : delta < 0) ? 'tu' : 'td';
  }

  hasPrevData(key: KpiKey): boolean {
    const range = this.previousRange;
    const empIds = new Set(this.filteredRecords.map(r => r.employeeId));
    return this.attendanceRows.some(row => {
      if (!row.attendanceDate || !empIds.has(row.employeeId)) return false;
      const d = this.parseDate(row.attendanceDate);
      return d >= range.start && d <= range.end;
    });
  }
  get averageSeniorityYears(): number { return this.round1(this.average(this.filteredRecords.map((i) => i.yearsAtCompany))); }
  /** Unique managers, deduped by numeric ID to handle same-name managers correctly. */
  get okrHeatmapManagers(): string[] {
    const seen = new Map<number, string>();
    for (const o of this.filteredOkrObjectives) {
      if (o.managerId && !seen.has(o.managerId)) {
        seen.set(o.managerId, o.managerName);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }

  get okrHeatmapMonths(): string[] {
    const range = this.currentRange;
    const months: string[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const endCursor = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= endCursor) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  private readonly MONTHS_FR = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
  formatOkrMonth(ym: string): string {
    const m = parseInt(ym.split('-')[1], 10);
    return isNaN(m) ? ym : (this.MONTHS_FR[m - 1] ?? ym);
  }

  okrHeatmapCellColor(manager: string, month: string): string {
    const cells = this.filteredOkrObjectives.filter(o => o.managerName === manager && o.dueDate?.startsWith(month));
    if (!cells.length) return '#f8fafc';
    const score = (cells.filter(o => o.riskStatus === 'OFF_TRACK').length + cells.filter(o => o.riskStatus === 'AT_RISK').length * 0.5) / cells.length;
    if (score === 0) return '#dcfce7';
    if (score < 0.25) return '#bbf7d0';
    if (score < 0.5) return '#fef9c3';
    if (score < 0.75) return '#fed7aa';
    return '#fecaca';
  }

  okrHeatmapCellTitle(manager: string, month: string): string {
    const cells = this.filteredOkrObjectives.filter(o => o.managerName === manager && o.dueDate?.startsWith(month));
    if (!cells.length) return `${manager} — ${this.formatOkrMonth(month)} : Aucun objectif`;
    const onTrack = cells.filter(o => o.riskStatus === 'ON_TRACK').length;
    const atRisk = cells.filter(o => o.riskStatus === 'AT_RISK').length;
    const offTrack = cells.filter(o => o.riskStatus === 'OFF_TRACK').length;
    return `${manager} — ${this.formatOkrMonth(month)} : ${onTrack} dans les temps · ${atRisk} à risque · ${offTrack} en retard`;
  }

  get criticalAlerts(): DashboardEmployeeRecord[] {
    return this.filteredRecords.filter((i) => i.attendanceRate < 70 && i.productivityScore < 60).sort((a, b) => (a.attendanceRate + a.productivityScore) - (b.attendanceRate + b.productivityScore)).slice(0, 12);
  }

  get filteredRecords(): DashboardEmployeeRecord[] {
    return this.records.filter((item) => {
      if (this.selectedDepartmentId !== null && item.departmentId !== this.selectedDepartmentId) return false;
      if (this.selectedGender && item.gender !== this.selectedGender) return false;
      return true;
    });
  }

  get filteredEvaluations(): Array<{ departement: string; scoreMoyen: number; }> {
    if (!this.data?.evaluationsParDepartement?.length) return [];
    if (this.selectedDepartmentId === null) return this.data.evaluationsParDepartement;
    const departmentName = this.selectedDepartmentName?.trim().toLowerCase();
    if (!departmentName) return this.data.evaluationsParDepartement;
    return this.data.evaluationsParDepartement.filter((item) => item.departement.trim().toLowerCase() === departmentName);
  }

  get ageDistribution(): Array<{ tranche: string; count: number; }> {
    const buckets: Array<{ tranche: string; min: number; max: number | null; }> = [
      { tranche: '< 25', min: 0, max: 24 },
      { tranche: '25-34', min: 25, max: 34 },
      { tranche: '35-44', min: 35, max: 44 },
      { tranche: '45-54', min: 45, max: 54 },
      { tranche: '55+', min: 55, max: null }
    ];
    return buckets.map((bucket) => ({
      tranche: bucket.tranche,
      count: this.filteredRecords.filter((item) => {
        if (item.age === null) return false;
        const max = bucket.max ?? Number.MAX_SAFE_INTEGER;
        return item.age >= bucket.min && item.age <= max;
      }).length
    }));
  }

  get departmentStats(): Array<{departmentId: number | null; department: string; count: number; attendanceRate: number; lateRate: number; tasksAssignedAvg: number; projectsAssignedAvg: number; taskCompletionRate: number; projectCompletionRate: number; productivityScore: number; averageTaskCompletionTime: number; yearsAtCompany: number; tasksAssignedTotal: number; tasksCompletedTotal: number; projectsAssignedTotal: number; projectsCompletedTotal: number;}> {
    const order = this.departments.map((d) => d.departmentName);
    const grouped = new Map<string, DashboardEmployeeRecord[]>();
    const idByName = new Map<string, number | null>();
    this.filteredRecords.forEach((record) => { if (!grouped.has(record.departmentName)) grouped.set(record.departmentName, []); grouped.get(record.departmentName)!.push(record); idByName.set(record.departmentName, record.departmentId); });
    return Array.from(new Set([...order, ...grouped.keys()])).map((department) => {
      const rows = grouped.get(department) ?? [];
      const tasksAssignedTotal = rows.reduce((s, i) => s + i.tasksAssigned, 0);
      const tasksCompletedTotal = rows.reduce((s, i) => s + i.tasksCompleted, 0);
      const projectsAssignedTotal = rows.reduce((s, i) => s + i.projectsAssigned, 0);
      const projectsCompletedTotal = rows.reduce((s, i) => s + i.projectsCompleted, 0);
      return {
        departmentId: idByName.get(department) ?? null,
        department,
        count: rows.length,
        attendanceRate: this.average(rows.map((i) => i.attendanceRate)),
        lateRate: this.average(rows.map((i) => i.lateRate)),
        tasksAssignedAvg: this.average(rows.map((i) => i.tasksAssigned)),
        projectsAssignedAvg: this.average(rows.map((i) => i.projectsAssigned)),
        taskCompletionRate: tasksAssignedTotal > 0 ? (tasksCompletedTotal / tasksAssignedTotal) * 100 : 0,
        projectCompletionRate: projectsAssignedTotal > 0 ? (projectsCompletedTotal / projectsAssignedTotal) * 100 : 0,
        productivityScore: this.average(rows.map((i) => i.productivityScore)),
        averageTaskCompletionTime: this.average(rows.map((i) => i.averageTaskCompletionTime)),
        yearsAtCompany: this.average(rows.map((i) => i.yearsAtCompany)),
        tasksAssignedTotal,
        tasksCompletedTotal,
        projectsAssignedTotal,
        projectsCompletedTotal
      };
    });
  }

  attendanceGaugeStyle(value: number): string {
    const safeValue = Math.max(0, Math.min(100, value));
    return `conic-gradient(#2563eb 0% ${safeValue}%, #e2e8f0 ${safeValue}% 100%)`;
  }

  onDepartmentSelected(deptName: string): void {
    const normalized = deptName.trim().toLowerCase();
    const fromMap = this.departmentByName.get(normalized);
    if (!fromMap) return;
    this.selectedDepartmentId = this.selectedDepartmentId === fromMap.id ? null : fromMap.id;
    this.refreshFromFilters();
  }

  onPeriodChange(period: DashboardPeriod): void {
    this.selectedPeriod = period;
    this.refreshFromFilters();
  }

  onDepartmentFilterChange(departmentId: number | null): void {
    this.selectedDepartmentId = departmentId;
    this.refreshFromFilters();
  }

  onGenderFilterChange(gender: 'H' | 'F' | null): void { this.selectedGender = gender; this.refreshFromFilters(); }

  exportFilteredDataExcel(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['period', 'employee_id', 'name', 'department', 'gender', 'age', 'years_at_company', 'tasks_assigned', 'tasks_completed', 'projects_assigned', 'projects_completed', 'average_task_completion_time', 'attendance_rate', 'absenteeism_rate', 'late_days', 'total_working_days', 'performance_score', 'productivity_score'];
      const periodLabel = this.currentPeriodLabel;
      const rows = this.filteredRecords.map((item) => [periodLabel, item.employeeId, item.name, item.departmentName, item.gender, item.age ?? '', this.round1(item.yearsAtCompany), item.tasksAssigned, item.tasksCompleted, item.projectsAssigned, item.projectsCompleted, this.round1(item.averageTaskCompletionTime), this.round1(item.attendanceRate), this.round1(item.absenteeismRate), this.round1(item.lateDays), this.round1(item.totalWorkingDays), this.round1(item.taskCompletionRate), this.round1(item.productivityScore)]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dashboard RH');
      XLSX.writeFile(wb, `dashboard-responsable-${this.selectedPeriod}.xlsx`);
    });
  }

  getKpiTendance(kpiId: string): string {
    switch (kpiId) {
      case 'effectif': return '—';
      case 'attendance': return this.attendanceTone === 'good' ? '↑ Dans les objectifs' : this.attendanceTone === 'warn' ? '→ Proche du seuil' : '↓ Sous les objectifs';
      case 'absenteisme': return this.absenteeismTone === 'good' ? '↑ Maîtrisé' : this.absenteeismTone === 'warn' ? '→ À surveiller' : '↓ Critique';
      case 'retard': return this.lateRateTone === 'good' ? '↑ Conforme' : this.lateRateTone === 'warn' ? '→ À surveiller' : '↓ Critique';
      default: return '—';
    }
  }

  // ── KPI threshold helpers ───────────────────────────────────────────────

  getKpiThreshold(kpiKey: string): KpiThreshold | null {
    return this.kpiThresholdService.getThreshold(kpiKey);
  }

  getKpiCurrentValue(kpiKey: string): number {
    switch (kpiKey) {
      case 'attendance':  return this.attendanceRateAverage;
      case 'absenteisme': return this.absenteeismRateAverage;
      case 'retard':      return this.lateRateAverage;
      case 'effectif':    return this.filteredRecords.length;
      default:            return 0;
    }
  }

  isThresholdBreached(kpiKey: string): boolean {
    if (!isKpiKey(kpiKey)) return false;
    const t = this.getKpiThreshold(kpiKey);
    return kpiIsBreached(kpiKey, this.getKpiCurrentValue(kpiKey), t?.thresholdValue);
  }

  isTargetAchieved(kpiKey: string): boolean {
    if (!isKpiKey(kpiKey)) return false;
    const t = this.getKpiThreshold(kpiKey);
    return kpiIsTargetAchieved(kpiKey, this.getKpiCurrentValue(kpiKey), t?.targetValue);
  }

  /** Position (0–100) of the current value along the KPI scale. */
  kpiProgressPct(kpiKey: string): number {
    const val = this.getKpiCurrentValue(kpiKey);
    if (kpiKey === 'effectif') return 0; // no progress bar for headcount
    return Math.max(0, Math.min(100, val));
  }

  /** Position (0–100) of the threshold marker on the progress bar. */
  kpiThresholdMarkerPct(kpiKey: string): number {
    const t = this.getKpiThreshold(kpiKey);
    if (!t || t.thresholdValue === null) return -1;
    return Math.max(0, Math.min(100, Number(t.thresholdValue)));
  }

  /** Position (0–100) of the target marker on the progress bar. */
  kpiTargetMarkerPct(kpiKey: string): number {
    const t = this.getKpiThreshold(kpiKey);
    if (!t || t.targetValue === null) return -1;
    return Math.max(0, Math.min(100, Number(t.targetValue)));
  }

  /** Bar fill colour based on breach/target status. */
  kpiBarColor(kpiKey: string): string {
    if (this.isThresholdBreached(kpiKey)) return '#ef4444';
    if (this.isTargetAchieved(kpiKey))   return '#16a34a';
    return '#f59e0b';
  }

  getKpiNotes(kpiKey: string): NoteResp[] {
    return this.notesService.notesSnapshot.filter(n => n.kpiKey === kpiKey);
  }

  // ── Threshold modal ─────────────────────────────────────────────────────

  openThresholdModal(kpiKey: string, kpiLabel: string, event: Event): void {
    if (!isKpiKey(kpiKey)) return;
    event.stopPropagation();
    this.thresholdModalKpiKey = kpiKey;
    this.thresholdModalKpiLabel = kpiLabel;
    this.thresholdModalOpen = true;
    this.cdr.markForCheck();
  }

  closeThresholdModal(): void {
    this.thresholdModalOpen = false;
    this.cdr.markForCheck();
  }

  onThresholdSaved(): void {
    this.checkAllThresholds();
    this.cdr.markForCheck();
  }

  // ── Note history / comment modal ────────────────────────────────────────

  openHistoryModal(kpiKey: string, kpiLabel: string, event: Event): void {
    event.stopPropagation();
    this.noteHistoryKpiKey   = kpiKey;
    this.noteHistoryKpiLabel = kpiLabel;
    this.noteHistoryComment  = '';
    this.noteHistoryOpen     = true;
    this.cdr.markForCheck();
  }

  closeHistoryModal(): void {
    this.noteHistoryOpen = false;
    this.cdr.markForCheck();
  }

  submitComment(textarea: HTMLTextAreaElement): void {
    const raw = textarea.value.trim();
    if (!raw) return;
    const val = this.round1(this.getKpiCurrentValue(this.noteHistoryKpiKey));
    const kpiValue = this.noteHistoryKpiKey === 'effectif' ? `${val} collaborateur${val > 1 ? 's' : ''}` : `${val}%`;
    this.notesService.add({
      userEmail: this.utilisateur?.email ?? '',
      kpiKey:    this.noteHistoryKpiKey,
      kpiLabel:  this.noteHistoryKpiLabel,
      kpiValue,
      filterScope: this.selectedDepartmentName ?? 'Tous les départements',
      periodLabel: this.currentPeriodLabel,
      content:   raw
    }).subscribe({
      next: () => {
        textarea.value = '';
        this.toastService.success('Commentaire enregistré');
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastService.error('Impossible d\'enregistrer le commentaire. Réessayez plus tard.');
        this.cdr.markForCheck();
      }
    });
  }

  deleteNote(noteId: number): void {
    this.notesService.delete(noteId).subscribe(() => this.cdr.markForCheck());
  }

  /** Check all configured thresholds after data load and trigger notifications. */
  private checkAllThresholds(): void {
    if (!this.isKpiDataReady()) return;
    const entries = this.kpiThresholdService.buildCheckEntries(
      (key) => this.getKpiCurrentValue(key),
      () => this.isKpiDataReady()
    );
    if (!entries.length) return;
    this.kpiThresholdService.checkBatch(entries).subscribe(() => {
      this.notificationService.refresh();
      this.cdr.markForCheck();
    });
  }

  private isKpiDataReady(): boolean {
    return this.attendanceRowsInPeriod().length > 0 && this.filteredRecords.length > 0;
  }

  private get currentRange(): DateRange {
    const now = new Date();
    if (this.selectedPeriod === 'year') {
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      };
    }
    if (this.selectedPeriod === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), quarter * 3, 1),
        end: new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999)
      };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    };
  }

  private get previousRange(): DateRange {
    const now = new Date();
    if (this.selectedPeriod === 'year') {
      const prevYear = now.getFullYear() - 1;
      return {
        start: new Date(prevYear, 0, 1),
        end: new Date(prevYear, 11, 31, 23, 59, 59, 999)
      };
    }
    if (this.selectedPeriod === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      const prevQuarter = quarter === 0 ? 3 : quarter - 1;
      const prevYear = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return {
        start: new Date(prevYear, prevQuarter * 3, 1),
        end: new Date(prevYear, prevQuarter * 3 + 3, 0, 23, 59, 59, 999)
      };
    }
    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: new Date(prevYear, prevMonth, 1),
      end: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999)
    };
  }

  private attendanceRowsInPeriod(): Attendance[] {
    const range = this.currentRange;
    return this.attendanceRows.filter((row) => {
      if (!row.attendanceDate) return false;
      const date = this.parseDate(row.attendanceDate);
      return date >= range.start && date <= range.end;
    });
  }

  private formatRangeLabel(range: DateRange): string {
    const fmt = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fmt(range.start)} – ${fmt(range.end)}`;
  }

  private parseDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map((value) => Number(value));
    return new Date(year, month - 1, day);
  }

  openNoteModal(kpiKey: string, kpiLabel: string): void {
    // Card click opens the note history + comment modal
    this.openHistoryModal(kpiKey, kpiLabel, new Event('click'));
  }

  closeNoteModal(): void {
    this.noteModalOpen = false;
    this.noteModalContent = '';
    this.cdr.markForCheck();
  }

  submitNote(textarea: HTMLTextAreaElement): void {
    const content = textarea.value.trim();
    if (!content) return;
    this.notesService.add({
      userEmail: this.utilisateur?.email ?? '',
      kpiKey: this.noteModalKpiKey || null,
      kpiLabel: this.noteModalKpiLabel || null,
      content
    }).subscribe({
      next: () => this.closeNoteModal(),
      error: () => this.closeNoteModal()
    });
  }

  private refreshFromFilters(): void {
    this.records = this.buildRecords();
    this.triggerFilterTransition();
    this.recalculatePresenceKpis();
    this.cdr.markForCheck();
    setTimeout(() => this.renderCharts());
  }

  private loadDepartments(): void {
    this.departmentService.getAllDepartments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((departments) => {
      this.departments = departments ?? [];
      this.departmentByName.clear();
      this.departments.forEach((department) => {
        const normalized = department.departmentName?.trim().toLowerCase();
        if (!normalized) return;
        this.departmentByName.set(normalized, { id: department.departmentId, name: department.departmentName });
      });
    });
  }

  private loadReferenceData(): void {
    // Employees + workload are the foundation for demographics, effectif, seniority.
    // Attendance is loaded separately with a fallback so a backend error never empties the page.
    forkJoin({
      employees: this.employeeService.getAllEmployees().pipe(catchError(() => of<any[]>([]))),
      workload: this.workloadService.getAll().pipe(catchError(() => of<any[]>([]))) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ employees, workload }) => {
        this.employees = employees ?? [];
        this.workloadRows = workload ?? [];
        this.records = this.buildRecords();
        this.isLoadingReference = false;
        this.recalculatePresenceKpis();
        this.cdr.markForCheck();
        setTimeout(() => this.renderCharts());
      });

    // Attendance loaded independently — failure never blocks the page
    this.attendanceService.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of<any[]>([])))
      .subscribe((attendance) => {
        this.attendanceRows = attendance ?? [];
        this.records = this.buildRecords();
        this.recalculatePresenceKpis();
        this.cdr.markForCheck();
        setTimeout(() => { this.renderCharts(); this.checkAllThresholds(); });
      });
  }

  private loadDashboardData(): void {
    this.isLoadingSummary = true;
    this.cdr.markForCheck();
    this.dashboardRhService.getSummary({ gender: this.selectedGender }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (summary) => { this.data = summary; this.isLoadingSummary = false; this.cdr.markForCheck(); setTimeout(() => this.renderCharts()); },
      error: () => { this.data = null; this.isLoadingSummary = false; this.cdr.markForCheck(); setTimeout(() => this.renderCharts()); }
    });
  }

  private buildRecords(): DashboardEmployeeRecord[] {
    const periodRows = this.attendanceRowsInPeriod();
    const rowsByEmployee = new Map<number, Attendance[]>();
    for (const row of periodRows) {
      if (!rowsByEmployee.has(row.employeeId)) rowsByEmployee.set(row.employeeId, []);
      rowsByEmployee.get(row.employeeId)!.push(row);
    }
    const workloadByEmployeeId = new Map(this.workloadRows.map((item) => [item.employeeId, item]));
    return this.employees.map((employee) => {
      const dailyRows = rowsByEmployee.get(employee.employeeId) ?? [];
      const workload = workloadByEmployeeId.get(employee.employeeId);
      const totalWorkingDays = dailyRows.length;
      const presentDays = dailyRows.filter(r => r.isPresent).length;
      const lateDays = dailyRows.filter(r => r.isLate).length;
      const attendanceRate = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;
      const lateRate = totalWorkingDays > 0 ? (lateDays / totalWorkingDays) * 100 : 0;
      const tasksAssigned = this.nonNegative(workload?.tasksAssigned ?? 0);
      const tasksCompleted = this.nonNegative(workload?.tasksCompleted ?? 0);
      const projectsAssigned = this.nonNegative(workload?.projectsAssigned ?? 0);
      const projectsCompleted = this.nonNegative(workload?.projectsCompleted ?? 0);
      const taskCompletionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;
      const projectCompletionRate = projectsAssigned > 0 ? (projectsCompleted / projectsAssigned) * 100 : 0;
      const productivityScore = Math.min(100, Math.max(0, ((taskCompletionRate / 100) * 70) + ((projectCompletionRate / 100) * 30)));
      return {
        employeeId: employee.employeeId,
        name: `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || `collaborateur #${employee.employeeId}`,
        departmentId: employee.departmentId ?? null,
        departmentName: employee.departmentName || 'N/A',
        gender: this.toGender(employee.gender),
        age: this.computeAge(employee.dateOfBirth ?? null),
        yearsAtCompany: this.computeYearsAtCompany(employee.hireDate ?? null),
        attendanceRate,
        absenteeismRate: 100 - attendanceRate,
        lateDays,
        totalWorkingDays: totalWorkingDays > 0 ? totalWorkingDays : this.inferTotalWorkingDays(0, 0),
        lateRate,
        tasksAssigned,
        tasksCompleted,
        projectsAssigned,
        projectsCompleted,
        averageTaskCompletionTime: this.nonNegative(workload?.averageTaskCompletionTime ?? 0),
        taskCompletionRate,
        projectCompletionRate,
        productivityScore
      };
    });
  }

  private recalculatePresenceKpis(): void {
    const rows = this.filteredRecords;
    this.attendanceRateAverage = this.round1(this.average(rows.map((item) => item.attendanceRate)));
    // Formule pondérée (cohérente avec absences-conges) : Σ absencesDays / Σ totalWorkingDays × 100
    const totalAbsDays = rows.reduce((sum, r) => sum + r.totalWorkingDays * (100 - r.attendanceRate) / 100, 0);
    const totalWrkDays = rows.reduce((sum, r) => sum + r.totalWorkingDays, 0);
    this.absenteeismRateAverage = totalWrkDays > 0
      ? this.round1((totalAbsDays / totalWrkDays) * 100)
      : 0;
    this.lateRateAverage = this.round1(this.average(rows.map((item) => item.lateRate)));

    // ── Previous period (for delta indicators) ────────────────────────────
    const prevRange = this.previousRange;
    const empIds = new Set(rows.map(r => r.employeeId));
    const prevRows = this.attendanceRows.filter(row => {
      if (!row.attendanceDate || !empIds.has(row.employeeId)) return false;
      const d = this.parseDate(row.attendanceDate);
      return d >= prevRange.start && d <= prevRange.end;
    });
    const prevByEmployee = new Map<number, Attendance[]>();
    for (const row of prevRows) {
      if (!prevByEmployee.has(row.employeeId)) prevByEmployee.set(row.employeeId, []);
      prevByEmployee.get(row.employeeId)!.push(row);
    }
    const prevAttRates: number[] = [];
    let prevAbsDays = 0;
    let prevWrkDays = 0;
    const prevLateRates: number[] = [];
    for (const empRows of prevByEmployee.values()) {
      const total = empRows.length;
      if (total === 0) continue;
      const present = empRows.filter(r => r.isPresent).length;
      const late = empRows.filter(r => r.isLate).length;
      prevAttRates.push(present / total * 100);
      prevAbsDays += (total - present);
      prevWrkDays += total;
      prevLateRates.push(late / total * 100);
    }
    this.attendanceRatePrev = prevAttRates.length > 0 ? this.round1(this.average(prevAttRates)) : 0;
    this.absenteeismRatePrev = prevWrkDays > 0 ? this.round1(prevAbsDays / prevWrkDays * 100) : 0;
    this.lateRatePrev = prevLateRates.length > 0 ? this.round1(this.average(prevLateRates)) : 0;
  }

  private triggerFilterTransition(): void {
    this.isFilterTransitioning = true;
    if (this.filterTransitionTimer) clearTimeout(this.filterTransitionTimer);
    this.filterTransitionTimer = setTimeout(() => {
      this.isFilterTransitioning = false;
      this.cdr.markForCheck();
    }, 360);
  }

  private renderCharts(): void {
    this.destroyCharts();
    if (this.isLoading) return;
    this.renderDepartmentChart();
    this.renderAgeChart();
    this.renderGenderChart();
    this.renderAttendanceByDepartmentChart();
    this.renderLateRateByDepartmentChart();
    this.renderTop5AtRiskChart();
    this.renderEvaluationChart();
    this.renderOkrCompletionChart();
    this.renderOkrStatusChart();
    this.renderSeniorityDistributionChart();
    this.renderSeniorityByDepartmentChart();
    this.renderSeniorityByGenderChart();
  }

  private renderDepartmentChart(): void { this.renderDonutByDepartment(); }

  private renderDonutByDepartment(): void {
    if (!this.departmentsCanvas || !this.hasDepartmentData) return;
    const stats = this.departmentStats.filter((item) => item.count > 0);
    const labels = stats.map((item) => item.department);
    const values = stats.map((item) => item.count);
    const total = values.reduce((sum, value) => sum + value, 0);
    const selectedName = this.selectedDepartmentName?.trim().toLowerCase() ?? null;
    const colors = labels.map((_, index) => {
      const base = this.departmentColors[index % this.departmentColors.length];
      const isSelected = selectedName === labels[index].trim().toLowerCase();
      return selectedName && !isSelected ? this.hexToRgba(base, 0.35) : base;
    });
    const chart = new Chart(this.departmentsCanvas.nativeElement, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }] },
      options: {
        cutout: '66%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'DM Sans', size: 11 } } },
          tooltip: { ...this.tooltipTheme(), callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} collaborateurs (${total > 0 ? this.round1((Number(ctx.raw) / total) * 100) : 0}%)` } }
        },
        onClick: (event) => {
          const points = chart.getElementsAtEventForMode(event as unknown as Event, 'nearest', { intersect: true }, true);
          if (!points.length) return;
          const clickedLabel = chart.data.labels?.[points[0].index];
          if (typeof clickedLabel === 'string') this.onDepartmentSelected(clickedLabel);
        }
      }
    });
    this.chartInstances.push(chart);
  }

  private renderAgeChart(): void {
    if (!this.ageCanvas || !this.hasAgeData) return;
    const labels = this.ageDistribution.map((item) => item.tranche);
    const values = this.ageDistribution.map((item) => item.count);
    const options = this.baseCartesianOptions({
      min: 0,
      tooltipFormatter: (ctx) => `${ctx.label}: ${ctx.raw} collaborateurs`
    });
    options.plugins = {
      ...options.plugins,
      legend: {
        ...(options.plugins?.legend ?? {}),
        display: false
      }
    };
    this.chartInstances.push(new Chart(this.ageCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: labels.map((_, i) => this.departmentColors[i % this.departmentColors.length]),
          borderRadius: 8
        }]
      },
      options
    }));
  }
  private renderGenderChart(): void { if (!this.genderCanvas || !this.hasGenderData) return; const males = this.filteredRecords.filter((item) => item.gender === 'H').length; const females = this.filteredRecords.filter((item) => item.gender === 'F').length; const total = males + females; this.chartInstances.push(new Chart(this.genderCanvas.nativeElement, { type: 'doughnut', data: { labels: ['Hommes', 'Femmes'], datasets: [{ data: [males, females], backgroundColor: [this.genderColors.H, this.genderColors.F], borderColor: '#ffffff', borderWidth: 2 }] }, options: { cutout: '62%', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'DM Sans', size: 11 } } }, tooltip: { ...this.tooltipTheme(), callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${total > 0 ? this.round1((Number(ctx.raw) / total) * 100) : 0}%)` } } } } })); }
  private renderAttendanceByDepartmentChart(): void {
    if (!this.attendanceDeptCanvas || !this.hasAttendanceByDeptData) return;
    const stats = this.departmentStats.filter((item) => item.count > 0);
    const labels = stats.map((item) => item.department);
    const values = stats.map((item) => this.round1(item.attendanceRate));
    const counts = stats.map((item) => item.count);
    const threshold = this.getKpiThreshold('attendance');
    const options = this.baseCartesianOptions({
      min: 0,
      max: 1,
      tooltipFormatter: (ctx) => `${ctx.label}: ${values[ctx.dataIndex]}% (${counts[ctx.dataIndex]} collaborateurs)`
    });
    options.plugins = {
      ...options.plugins,
      legend: { ...(options.plugins?.legend ?? {}), display: false }
    };
    options.scales = {
      ...options.scales,
      x: { ...(options.scales?.x ?? {}), grid: { color: '#E2E8F0', drawBorder: false } },
      y: { ...(options.scales?.y ?? {}), min: 0, max: 1, ticks: { display: false }, grid: { display: false } }
    };

    const datasets: any[] = [{
      label: 'Heatmap présence',
      data: labels.map(() => 1),
      backgroundColor: values.map((value) => this.hexToRgba(this.performanceColor(value, 90, 75), 0.9)),
      borderColor: '#ffffff',
      borderWidth: 2,
      borderRadius: 6,
      categoryPercentage: 0.92,
      barPercentage: 0.98
    }];

    if (threshold?.thresholdValue !== null && threshold?.thresholdValue !== undefined) {
      datasets.push({ type: 'line', label: `Seuil ${threshold.thresholdValue}%`, data: labels.map(() => Number(threshold.thresholdValue) / 100), borderColor: '#ef4444', borderDash: [5, 4], borderWidth: 2, pointRadius: 0 });
    }
    if (threshold?.targetValue !== null && threshold?.targetValue !== undefined) {
      datasets.push({ type: 'line', label: `Cible ${threshold.targetValue}%`, data: labels.map(() => Number(threshold.targetValue) / 100), borderColor: '#16a34a', borderDash: [5, 4], borderWidth: 2, pointRadius: 0 });
    }

    this.chartInstances.push(new Chart(this.attendanceDeptCanvas.nativeElement, {
      type: 'bar',
      data: { labels, datasets },
      options
    }));
  }
  private renderTop5AtRiskChart(): void {
    if (!this.top5AtRiskCanvas || !this.hasTop5AtRiskData) return;
    const employees = this.top5AtRiskEmployees;
    const labels = employees.map((item) => this.truncateLabel(item.name, 22));
    const absenteeismValues = employees.map((item) => this.round1(item.absenteeismRate));
    const lateValues = employees.map((item) => this.round1(item.lateRate));
    const maxValue = Math.max(...absenteeismValues, ...lateValues, 0);
    const options = this.baseCartesianOptions({
      indexAxis: 'y',
      min: 0,
      max: Math.max(25, Math.ceil(maxValue + 5)),
      tooltipFormatter: (ctx) => {
        const employee = employees[ctx.dataIndex];
        if (!employee) return `${ctx.dataset.label}: ${ctx.raw}%`;
        if (ctx.datasetIndex === 0) {
          return `${employee.name} — Absentéisme: ${ctx.raw}% · Présence: ${this.round1(employee.attendanceRate)}%`;
        }
        return `${employee.name} — Retards: ${ctx.raw}% · Score risque: ${this.round1(this.presenceRiskScore(employee))}`;
      }
    });
    options.plugins = {
      ...options.plugins,
      legend: {
        ...(options.plugins?.legend ?? {}),
        position: 'bottom',
        labels: { color: '#64748b', font: { size: 11, family: 'DM Sans' }, boxWidth: 12 }
      }
    };
    options.scales = {
      ...options.scales,
      x: {
        ...(options.scales?.x ?? {}),
        ticks: {
          ...(options.scales?.x?.ticks ?? {}),
          callback: (value: string | number) => `${value}%`
        }
      }
    };

    this.chartInstances.push(new Chart(this.top5AtRiskCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Absentéisme',
            data: absenteeismValues,
            backgroundColor: absenteeismValues.map((value) => this.absenteeismColor(value)),
            borderRadius: 6
          },
          {
            label: 'Retards',
            data: lateValues,
            backgroundColor: lateValues.map((value) => this.lateColor(value)),
            borderRadius: 6
          }
        ]
      },
      options
    }));
  }

  private renderLateRateByDepartmentChart(): void {
    if (!this.lateRateDeptCanvas || !this.hasLateRateByDeptData) return;
    const stats = [...this.departmentStats].filter((item) => item.count > 0).sort((a, b) => b.lateRate - a.lateRate);
    const values = stats.map((item) => this.round1(item.lateRate));
    const maxX = Math.max(15, Math.ceil(Math.max(...values, 0) + 2));
    const yLabels = stats.map((item) => item.department);
    const threshold = this.getKpiThreshold('retard');
    const datasets: any[] = [{
      label: 'Taux de retard',
      data: stats.map((item, index) => ({ x: this.round1(item.lateRate), y: index })),
      backgroundColor: values.map((value) => this.lateColor(value)),
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      pointRadius: 7,
      pointHoverRadius: 8
    }];
    if (threshold?.thresholdValue !== null && threshold?.thresholdValue !== undefined) {
      datasets.push({ type: 'line', label: `Seuil ${threshold.thresholdValue}%`, data: yLabels.map((_, i) => ({ x: Number(threshold.thresholdValue), y: i })), borderColor: '#ef4444', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, showLine: true });
    }
    if (threshold?.targetValue !== null && threshold?.targetValue !== undefined) {
      datasets.push({ type: 'line', label: `Cible ${threshold.targetValue}%`, data: yLabels.map((_, i) => ({ x: Number(threshold.targetValue), y: i })), borderColor: '#16a34a', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, showLine: true });
    }
    this.chartInstances.push(new Chart(this.lateRateDeptCanvas.nativeElement, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: maxX,
            beginAtZero: true,
            grid: { color: '#E2E8F0' },
            ticks: {
              color: '#64748b',
              font: { size: 11, family: 'DM Sans' },
              callback: (value: string | number) => `${value}%`
            }
          },
          y: {
            type: 'linear',
            min: -0.5,
            max: Math.max(stats.length - 0.5, 0.5),
            offset: false,
            grid: { color: '#E2E8F0' },
            ticks: {
              stepSize: 1,
              color: '#64748b',
              font: { size: 11, family: 'DM Sans' },
              callback: (value: string | number) => {
                const numeric = Number(value);
                return Number.isInteger(numeric) ? (yLabels[numeric] ?? '') : '';
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this.tooltipTheme(),
            callbacks: {
              label: (ctx: any) => {
                const dataIndex = ctx.dataIndex;
                return `${stats[dataIndex].department}: ${values[dataIndex]}% (${stats[dataIndex].count} collaborateurs)`;
              }
            }
          }
        }
      }
    }));
  }

  private renderOkrCompletionChart(): void {
    if (!this.okrCompletionCanvas || !this.hasOkrCompletionData) return;
    // Build unique managers by numeric ID to avoid grouping by name string
    const managerMap = new Map<number, string>();
    for (const o of this.filteredOkrObjectives) {
      if (o.managerId && !managerMap.has(o.managerId)) {
        managerMap.set(o.managerId, o.managerName);
      }
    }
    const entries = [...managerMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const labels    = entries.map(([, name]) => name);
    const completed  = entries.map(([id]) => this.filteredOkrObjectives.filter(o => o.managerId === id && o.progressPercent >= 100).length);
    const inProgress = entries.map(([id]) => this.filteredOkrObjectives.filter(o => o.managerId === id && o.progressPercent > 0 && o.progressPercent < 100).length);
    const notStarted = entries.map(([id]) => this.filteredOkrObjectives.filter(o => o.managerId === id && o.progressPercent === 0).length);
    const opts = this.baseCartesianOptions({ min: 0, tooltipFormatter: (ctx) => `${ctx.dataset.label}: ${ctx.raw}` });
    opts.scales = { x: { stacked: false, grid: { color: '#E2E8F0' }, ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } } }, y: { stacked: false, beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } } } };
    this.chartInstances.push(new Chart(this.okrCompletionCanvas.nativeElement, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Terminés',     data: completed,  backgroundColor: '#16a34a', borderRadius: 6 },
        { label: 'En cours',     data: inProgress, backgroundColor: '#f59e0b', borderRadius: 6 },
        { label: 'Non démarrés', data: notStarted, backgroundColor: '#94a3b8', borderRadius: 6 }
      ] },
      options: opts
    }));
  }

  private renderOkrStatusChart(): void {
    if (!this.okrStatusCanvas || !this.hasOkrStatusData) return;
    const onTrack  = this.filteredOkrObjectives.filter(o => o.riskStatus === 'ON_TRACK').length;
    const atRisk   = this.filteredOkrObjectives.filter(o => o.riskStatus === 'AT_RISK').length;
    const offTrack = this.filteredOkrObjectives.filter(o => o.riskStatus === 'OFF_TRACK').length;
    const total    = onTrack + atRisk + offTrack;
    this.chartInstances.push(new Chart(this.okrStatusCanvas.nativeElement, {
      type: 'doughnut',
      data: { labels: ['Dans les temps', 'À risque', 'En retard'], datasets: [{ data: [onTrack, atRisk, offTrack], backgroundColor: ['#16a34a', '#f59e0b', '#dc2626'], borderColor: '#ffffff', borderWidth: 2 }] },
      options: { cutout: '66%', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'DM Sans', size: 11 } } }, tooltip: { ...this.tooltipTheme(), callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${total > 0 ? this.round1((Number(ctx.raw) / total) * 100) : 0}%)` } } } }
    }));
  }

  private loadOkrData(): void {
    this.okrService.getAllObjectives()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of({ objectives: [], milestones: [] })))
      .subscribe(({ objectives }) => {
        this.okrObjectives = objectives ?? [];
        this.cdr.markForCheck();
        setTimeout(() => this.renderCharts());
      });
  }
  private renderEvaluationChart(): void { if (!this.evaluationCanvas || !this.hasEvaluationData) return; const labels = this.filteredEvaluations.map((item) => item.departement); const values = this.filteredEvaluations.map((item) => item.scoreMoyen); const average = values.reduce((sum, score) => sum + score, 0) / values.length; this.chartInstances.push(new Chart(this.evaluationCanvas.nativeElement, { type: 'bar', data: { labels, datasets: [{ label: 'Score moyen', data: values, backgroundColor: values.map((v) => this.performanceColor(v, 80, 60)), borderRadius: 8 }, { type: 'line', label: 'Moyenne globale', data: labels.map(() => average), borderColor: '#334155', borderDash: [6, 6], borderWidth: 2, pointRadius: 0 }] }, options: this.baseCartesianOptions({ min: 0, max: 100, tooltipFormatter: (ctx) => `${ctx.label}: ${this.round1(Number(ctx.raw ?? 0))}/100` }) } as any)); }
  private renderSeniorityDistributionChart(): void {
    if (!this.seniorityDistributionCanvas || !this.hasSeniorityData) return;
    const counts = this.seniorityBuckets.map((bucket) => this.filteredRecords.filter((item) => this.toSeniorityBucket(item.yearsAtCompany) === bucket).length);
    const centers = [1, 4, 8, 13, 18];
    const weightedTotal = counts.reduce((sum, count) => sum + count, 0);
    const weightedMean = weightedTotal > 0 ? counts.reduce((sum, count, idx) => sum + (count * centers[idx]), 0) / weightedTotal : 0;
    const weightedVariance = weightedTotal > 0
      ? counts.reduce((sum, count, idx) => sum + (count * ((centers[idx] - weightedMean) ** 2)), 0) / weightedTotal
      : 0;
    const weightedStd = Math.sqrt(Math.max(weightedVariance, 1e-6));
    const gaussianRaw = centers.map((x) => Math.exp(-0.5 * (((x - weightedMean) / weightedStd) ** 2)));
    const maxRaw = Math.max(...gaussianRaw, 1);
    const maxCount = Math.max(...counts, 1);
    const gaussianScaled = gaussianRaw.map((value) => this.round1((value / maxRaw) * maxCount));
    const options = this.baseCartesianOptions({ min: 0, tooltipFormatter: (ctx) => `${ctx.label}: ${ctx.raw} collaborateurs` });
    options.plugins = {
      ...options.plugins,
      legend: {
        ...(options.plugins?.legend ?? {}),
        display: false
      }
    };
    options.plugins.tooltip = {
      ...this.tooltipTheme(),
      callbacks: {
        label: (ctx: any) => {
          if (ctx.datasetIndex === 1) return `Courbe normale: ${this.round1(Number(ctx.raw ?? 0))}`;
          return `${ctx.label}: ${ctx.raw} collaborateurs`;
        }
      }
    };
    this.chartInstances.push(new Chart(this.seniorityDistributionCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.seniorityBuckets,
        datasets: [
          { label: 'collaborateurs', data: counts, backgroundColor: '#2563EB', borderRadius: 8 },
          {
            type: 'line',
            label: 'Courbe normale',
            data: gaussianScaled,
            borderColor: '#6962D2',
            backgroundColor: this.hexToRgba('#6962D2', 0.2),
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 4
          }
        ]
      },
      options
    }));
  }
  private renderSeniorityByDepartmentChart(): void {
    if (!this.seniorityDeptCanvas || !this.hasSeniorityData) return;
    const stats = [...this.departmentStats].filter((item) => item.count > 0).sort((a, b) => b.yearsAtCompany - a.yearsAtCompany);
    const labels = stats.map((item) => item.department);
    const values = stats.map((item) => this.round1(item.yearsAtCompany));
    const counts = stats.map((item) => item.count);
    const options = this.baseCartesianOptions({ indexAxis: 'y', min: 0, tooltipFormatter: (ctx) => `${ctx.label}: ${ctx.raw} ans (${counts[ctx.dataIndex]} collaborateurs)` });
    options.plugins = {
      ...options.plugins,
      legend: {
        ...(options.plugins?.legend ?? {}),
        display: false
      }
    };
    this.chartInstances.push(new Chart(this.seniorityDeptCanvas.nativeElement, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Ancienneté moyenne', data: values, backgroundColor: '#14B8A6', borderRadius: 8 }] },
      options
    }));
  }
  private renderSeniorityByGenderChart(): void {
    if (!this.seniorityGenderCanvas || !this.hasSeniorityData) return;
    const maleData = this.seniorityBuckets.map((bucket) => this.filteredRecords.filter((item) => item.gender === 'H' && this.toSeniorityBucket(item.yearsAtCompany) === bucket).length);
    const femaleData = this.seniorityBuckets.map((bucket) => this.filteredRecords.filter((item) => item.gender === 'F' && this.toSeniorityBucket(item.yearsAtCompany) === bucket).length);
    this.chartInstances.push(new Chart(this.seniorityGenderCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: this.seniorityBuckets,
        datasets: [
          {
            label: 'Hommes',
            data: maleData,
            showLine: false,
            pointRadius: 6,
            pointHoverRadius: 7,
            pointBackgroundColor: this.genderColors.H,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2
          },
          {
            label: 'Femmes',
            data: femaleData,
            showLine: false,
            pointRadius: 6,
            pointHoverRadius: 7,
            pointBackgroundColor: this.genderColors.F,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2
          }
        ]
      },
      options: this.baseCartesianOptions({ min: 0, tooltipFormatter: (ctx) => `${ctx.dataset.label} - ${ctx.label}: ${ctx.raw}` })
    }));
  }

  private destroyCharts(): void { this.chartInstances.forEach((chart) => chart.destroy()); this.chartInstances.length = 0; }

  private baseCartesianOptions(params: { indexAxis?: 'x' | 'y'; min?: number; max?: number; tooltipFormatter: (ctx: any) => string; }): any {
    return { indexAxis: params.indexAxis ?? 'x', responsive: true, maintainAspectRatio: false, scales: { x: { min: params.indexAxis === 'y' ? params.min : undefined, max: params.indexAxis === 'y' ? params.max : undefined, beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } } }, y: { min: params.indexAxis === 'x' ? params.min : undefined, max: params.indexAxis === 'x' ? params.max : undefined, beginAtZero: true, grid: { color: '#E2E8F0' }, ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } } } }, plugins: { legend: { labels: { color: '#64748b', font: { size: 11, family: 'DM Sans' } } }, tooltip: { ...this.tooltipTheme(), callbacks: { label: (ctx: any) => params.tooltipFormatter(ctx) } } } };
  }

  private tooltipTheme(): any { return { backgroundColor: '#0f172a', titleColor: '#ffffff', bodyColor: '#ffffff', padding: 10, cornerRadius: 8, displayColors: false }; }
  private performanceColor(value: number, good: number, warn: number): string { return value >= good ? '#16a34a' : value >= warn ? '#f59e0b' : '#dc2626'; }
  private performanceTone(value: number, good: number, warn: number): Tone { return value >= good ? 'good' : value >= warn ? 'warn' : 'bad'; }
  private lateColor(value: number): string { return value > 10 ? '#dc2626' : value >= 5 ? '#f59e0b' : '#16a34a'; }
  private absenteeismColor(value: number): string { return value < 10 ? '#16a34a' : value <= 25 ? '#f59e0b' : '#dc2626'; }
  private presenceRiskScore(record: DashboardEmployeeRecord): number {
    return record.absenteeismRate * 0.65 + record.lateRate * 0.35;
  }
  private truncateLabel(value: string, maxLength: number): string {
    const trimmed = value.trim();
    return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
  }
  private toSeniorityBucket(years: number): string { return years <= 2 ? '0-2 ans' : years <= 5 ? '3-5 ans' : years <= 10 ? '6-10 ans' : years <= 15 ? '11-15 ans' : '15+ ans'; }
  private computeAge(dateOfBirthRaw: string | null): number | null { if (!dateOfBirthRaw) return null; const birth = new Date(dateOfBirthRaw); if (Number.isNaN(birth.getTime())) return null; const now = new Date(); let age = now.getFullYear() - birth.getFullYear(); const m = now.getMonth() - birth.getMonth(); if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1; return age < 0 ? null : age; }
  private computeYearsAtCompany(hireDateRaw: string | null): number { if (!hireDateRaw) return 0; const hire = new Date(hireDateRaw); if (Number.isNaN(hire.getTime())) return 0; return Math.max(0, (Date.now() - hire.getTime()) / (1000 * 60 * 60 * 24 * 365.25)); }
  private inferTotalWorkingDays(absencesDays: number, attendanceRate: number): number { if (attendanceRate <= 0 || attendanceRate >= 100 || absencesDays <= 0) return 0; const v = absencesDays / (1 - (attendanceRate / 100)); return Number.isFinite(v) && v > 0 ? v : 0; }
  private average(values: number[]): number { return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0; }
  private round1(value: number): number { return Math.round(value * 10) / 10; }
  private clampRate(value: number): number { const v = Number(value); return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0; }
  private nonNegative(value: number): number { const v = Number(value); return Number.isFinite(v) ? Math.max(0, v) : 0; }
  private sanitizeGender(gender: string): 'H' | 'F' | null { const n = (gender ?? '').trim().toLowerCase(); if (n === 'h' || n === 'm' || n === 'male' || n === 'homme') return 'H'; if (n === 'f' || n === 'female' || n === 'femme') return 'F'; return null; }
  private toGender(gender: string): Gender { return this.sanitizeGender(gender) ?? 'N/A'; }
  private hexToRgba(hex: string, alpha: number): string { const normalizedHex = hex.replace('#', ''); const hexValue = normalizedHex.length === 3 ? normalizedHex.split('').map((c) => c + c).join('') : normalizedHex; const intValue = Number.parseInt(hexValue, 16); return `rgba(${(intValue >> 16) & 255}, ${(intValue >> 8) & 255}, ${intValue & 255}, ${alpha})`; }
}
