import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart, registerables, ChartDataset } from 'chart.js';
import { catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import {
  PredictionService,
  PredictionResult,
  RiskLevel
} from '../../../../services/prediction.service';
import { Attendance } from '../../../../services/attendance.service';
import { AuthService } from '../../../../services/auth';
import { ToastService } from '../../../../components/toast/toast.service';
import { KpiThresholdService } from '../../../../services/kpi-threshold.service';
import { NotificationService } from '../../../../services/notification.service';
import { KpiThresholdModalComponent } from '../../../../components/kpi-threshold-modal/kpi-threshold-modal.component';
import { KpiKey, isKpiKey, KPI_THRESHOLD_DEFINITIONS } from '../../../../models/kpi-threshold.config';
import {
  BradfordScore,
  DepartmentConfig,
  EmployeeProfile,
  EnrichedAbsence,
  TypeColorMap,
  LeaveRequest,
  LeaveBalance
} from '../../absences-conges.models';

// ─── Local interfaces ─────────────────────────────────────────────────────────

interface KpiCard {
  id: string;
  label: string;
  value: string;
  delta: number | null;
  unit: string;
  status: 'danger' | 'warning' | 'good' | 'info';
  actionLabel?: string;
  tooltip?: string;
}

interface HeatmapCell {
  status: 'present' | 'absent' | 'leave' | 'late' | 'weekend' | 'future' | 'nodata';
  tooltip: string;
}

interface HeatmapRow {
  employeeId: number;
  name: string;
  cells: HeatmapCell[];
}

interface GanttBlock {
  startDay: number;
  endDay: number;
  type: string;
  label: string;
  overlap: boolean;
}

interface GanttRow {
  employeeId: number;
  name: string;
  blocks: GanttBlock[];
}

interface TopRiskEmployee {
  employeeId: number;
  name: string;
  riskProba: number;
  riskLevel: RiskLevel;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-analytics-advanced',
  standalone: true,
  imports: [CommonModule, FormsModule, KpiThresholdModalComponent],
  templateUrl: './analytics-advanced.component.html',
  styleUrl: './analytics-advanced.component.scss'
})
export class AnalyticsAdvancedComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {

  // ===== Canvas refs =====
  @ViewChild('seasonalCanvas') seasonalCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendCanvas')    trendCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('lateWdCanvas')   lateWdCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('deptAbsCanvas')  deptAbsCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('durationCanvas') durationCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('otDeptCanvas')   otDeptCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('scatterCanvas')  scatterCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('recidCanvas')    recidCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('radarRhCanvas')  radarRhCanvas?: ElementRef<HTMLCanvasElement>;

  // ===== Inputs =====
  @Input() enrichedAbsences: EnrichedAbsence[] = [];
  @Input() employees: EmployeeProfile[] = [];
  @Input() departments: DepartmentConfig[] = [];
  @Input() typeColors!: TypeColorMap;
  @Input() attendanceRows: Attendance[] = [];
  @Input() leaveRequests: LeaveRequest[] = [];
  @Input() leaveBalances: LeaveBalance[] = [];
  @Input() congePayeEntitled = 18;

  // ===== Internal =====
  private static chartsRegistered = false;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly kpiThresholdService = inject(KpiThresholdService);
  private readonly notificationService = inject(NotificationService);
  private readonly predictionService = inject(PredictionService);
  private charts = new Map<string, Chart>();

  // ===== IA absentéisme (non-bloquant) =====
  iaRisks: PredictionResult[] = [];
  iaLoading = false;
  iaUnavailable = false;
  iaForecastActive = false;

  showThresholdModal = false;
  thresholdModalKpiKey: KpiKey = 'absenteisme';
  thresholdModalKpiLabel = '';

  readonly kpiDefinitions: Record<string, { label: string; formula: string; target: string }> = {
    absenteisme: { label: KPI_THRESHOLD_DEFINITIONS.absenteisme.label, formula: KPI_THRESHOLD_DEFINITIONS.absenteisme.formula, target: KPI_THRESHOLD_DEFINITIONS.absenteisme.suggestedTarget }
  };

  get todayDateStr(): string {
    return new Date().toLocaleDateString('fr-FR');
  }

  // ===== Filter state =====
  filterPeriod: 'month' | 'quarter' | 'year' = 'month';
  filterDepartment = '';
  filterType = '';
  customStart = '';
  customEnd = '';

  // ===== Derived data =====
  kpiCards: KpiCard[] = [];
  funnelSteps: { label: string; count: number; pct: number; color: string }[] = [];
  balanceList: { name: string; remaining: number; entitled: number; pct: number; alert: boolean }[] = [];
  balanceKpi: { avg: number; atRiskPct: number; exhaustedCount: number } = { avg: 0, atRiskPct: 0, exhaustedCount: 0 };
  scatterCorrelation: { r: number; label: string; color: string } = { r: 0, label: '', color: '#94a3b8' };
  heatmapDays: { day: number; label: string; isWeekend: boolean; isToday: boolean }[] = [];
  heatmapRows: HeatmapRow[] = [];
  ganttDays: { day: number; label: string }[] = [];
  ganttRows: GanttRow[] = [];
  alertMessages: string[] = [];
  bradfordScores: BradfordScore[] = [];
  chronicsCount = 0;

  // ===== HR Tension index =====
  hrTensionScore = 0;
  hrTensionDelta: number | null = null;
  hrTensionDeptScores: { name: string; score: number }[] = [];
  private readonly OT_SEUIL_HEURES = 15;

  // ===== Radar RH santé =====
  private readonly RADAR_DEPT_COLORS = [
    '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6',
    '#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#64748b'
  ];
  radarSelectedDepts = new Set<string>();
  radarRhLegendItems: { label: string; color: string; active: boolean }[] = [];

  // ===== Bradford pagination =====
  readonly BRADFORD_PAGE_SIZE = 10;
  bradfordPage = 1;

  // ─── Getters ───────────────────────────────────────────────────────────────

  get bradfordTotalPages(): number {
    return Math.max(1, Math.ceil(this.bradfordScores.length / this.BRADFORD_PAGE_SIZE));
  }

  get pagedBradfordScores(): BradfordScore[] {
    const start = (this.bradfordPage - 1) * this.BRADFORD_PAGE_SIZE;
    return this.bradfordScores.slice(start, start + this.BRADFORD_PAGE_SIZE);
  }

  get hasAlerts(): boolean { return this.alertMessages.length > 0; }

  get ganttMonthDaysCount(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }

  get heatmapMonthLabel(): string {
    return new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  get ganttMonthLabel(): string { return this.heatmapMonthLabel; }

  get pendingFunnelCount(): number { return this.funnelSteps[1]?.count ?? 0; }

  get filterRange(): { start: Date; end: Date } {
    const now = new Date();
    switch (this.filterPeriod) {
      case 'month':
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        };
      case 'quarter': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        return {
          start: new Date(now.getFullYear(), qm, 1),
          end: new Date(now.getFullYear(), qm + 3, 0, 23, 59, 59)
        };
      }
      case 'year':
        return {
          start: new Date(now.getFullYear(), 0, 1),
          end: new Date(now.getFullYear(), 11, 31, 23, 59, 59)
        };
      default:
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        };
    }
  }

  get prevRange(): { start: Date; end: Date } {
    const now = new Date();
    switch (this.filterPeriod) {
      case 'month': {
        const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { start: pm, end: new Date(pm.getFullYear(), pm.getMonth() + 1, 0, 23, 59, 59) };
      }
      case 'quarter': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        const pq = new Date(now.getFullYear(), qm - 3, 1);
        return { start: pq, end: new Date(pq.getFullYear(), pq.getMonth() + 3, 0, 23, 59, 59) };
      }
      case 'year':
        return {
          start: new Date(now.getFullYear() - 1, 0, 1),
          end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
        };
      default: {
        const r = this.filterRange;
        const diff = r.end.getTime() - r.start.getTime();
        return {
          start: new Date(r.start.getTime() - diff),
          end: new Date(r.start.getTime() - 1)
        };
      }
    }
  }

  // ─── Constructor / lifecycle ───────────────────────────────────────────────

  constructor() {
    if (!AnalyticsAdvancedComponent.chartsRegistered) {
      Chart.register(...registerables);
      AnalyticsAdvancedComponent.chartsRegistered = true;
    }
  }

  ngOnInit(): void {
    this.loadIaPredictions();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.renderAllCharts(), 0);
    }
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['enrichedAbsences'] || changes['employees'] ||
      changes['attendanceRows'] || changes['leaveRequests'] || changes['leaveBalances']
    ) {
      this.recompute();
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.renderAllCharts(), 0);
      }
    }
    if (changes['employees'] && !changes['employees'].firstChange) {
      this.loadIaPredictions();
    }
  }

  /** Charge les prédictions IA en arrière-plan (ne bloque pas le reste de la page). */
  private loadIaPredictions(): void {
    const ids = this.employees.map((e) => e.id).filter((id) => Number.isFinite(id));
    if (!ids.length) {
      this.iaRisks = [];
      this.iaUnavailable = false;
      this.iaForecastActive = false;
      return;
    }

    this.iaLoading = true;
    this.iaUnavailable = false;
    this.predictionService.getAllEmployeesAbsenteismeRisk(ids).pipe(
      catchError(() => of([] as PredictionResult[]))
    ).subscribe((results) => {
      this.iaRisks = results;
      this.iaLoading = false;
      this.iaUnavailable = results.length === 0;
      this.iaForecastActive = results.length > 0;
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.renderSeasonalChart(), 0);
      }
    });
  }

  get topRiskEmployees(): TopRiskEmployee[] {
    return this.iaRisks
      .map((r) => {
        const emp = this.employees.find((e) => e.id === r.employeeId);
        return {
          employeeId: r.employeeId,
          name: emp?.fullName ?? `Collaborateur #${r.employeeId}`,
          riskProba: r.riskProba,
          riskLevel: r.riskLevel
        };
      })
      .sort((a, b) => b.riskProba - a.riskProba)
      .slice(0, 5);
  }

  // ─── Public event handlers ─────────────────────────────────────────────────

  onFilterChange(): void {
    this.recompute();
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.renderAllCharts(), 0);
    }
  }

  openThresholdModal(kpiKey: string, kpiLabel: string, event: Event): void {
    if (!isKpiKey(kpiKey)) return;
    event.stopPropagation();
    this.thresholdModalKpiKey = kpiKey;
    this.thresholdModalKpiLabel = kpiLabel;
    this.showThresholdModal = true;
  }

  closeThresholdModal(): void {
    this.showThresholdModal = false;
  }

  onThresholdSaved(): void {
    this.checkAllThresholds();
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.renderTrendChart(), 0);
    }
  }

  getKpiThreshold(kpiKey: string) {
    return this.kpiThresholdService.getThreshold(kpiKey);
  }

  getKpiCurrentValue(kpiKey: string): number {
    const card = this.kpiCards.find(c => c.id === kpiKey || (kpiKey === 'absenteisme' && c.id === 'absrate'));
    if (!card) return 0;
    return parseFloat(card.value) || 0;
  }

  private checkAllThresholds(): void {
    if (!this.isKpiDataReady()) return;
    const entries = this.kpiThresholdService.buildCheckEntries(
      (key) => this.getKpiCurrentValue(key),
      () => this.isKpiDataReady()
    );
    if (!entries.length) return;
    this.kpiThresholdService.checkBatch(entries).subscribe(() => {
      this.notificationService.refresh();
    });
  }

  private isKpiDataReady(): boolean {
    return this.attendanceRows.length > 0 && this.employees.length > 0;
  }

  // ─── Recompute ─────────────────────────────────────────────────────────────

  private recompute(): void {
    const range = this.filterRange;
    const prev  = this.prevRange;

    // Filtered attendance rows (daily records)
    const filtAtt = this.attendanceRows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= range.start && d <= range.end &&
        (!this.filterDepartment ||
          this.employees.find(e => e.id === r.employeeId)?.department === this.filterDepartment);
    });
    const prevAtt = this.attendanceRows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= prev.start && d <= prev.end &&
        (!this.filterDepartment ||
          this.employees.find(e => e.id === r.employeeId)?.department === this.filterDepartment);
    });

    // Filtered leave requests
    const filtLeave = this.leaveRequests.filter(lr =>
      this.overlaps(lr.startDate, lr.endDate, range) &&
      (!this.filterDepartment ||
        this.employees.find(e => e.id === lr.employeeId)?.department === this.filterDepartment) &&
      (!this.filterType || lr.type === this.filterType)
    );

    // Bradford — computed on a rolling 52-week window (standard)
    this.bradfordPage = 1;
    this.bradfordScores = this.employees
      .map(emp => this.computeBradfordScore(emp.id))
      .filter(s => s.totalDays > 0)
      .sort((a, b) => b.score - a.score);

    this.computeKpis(filtAtt, prevAtt, range, prev);
    this.computeFunnel(filtLeave);
    this.computeHrTension();
    this.computeBalanceList();
    this.computeHeatmap();
    this.computeGantt();
    this.computeAlerts();
    this.chronicsCount = this.countEpisodesAbove(4, range);
  }

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  private computeKpis(
    filtAtt: Attendance[], prevAtt: Attendance[],
    range: { start: Date; end: Date }, prev: { start: Date; end: Date }
  ): void {
    const absRate      = this.calcAbsRate(filtAtt, range);
    const prevAbsRate  = this.calcAbsRate(prevAtt, prev);
    const absDelta     = Math.round((absRate - prevAbsRate) * 10) / 10;

    const lateRate      = this.calcLateRate(filtAtt, range);
    const prevLateRate  = this.calcLateRate(prevAtt, prev);
    const punctRate     = Math.round((100 - lateRate)     * 10) / 10;
    const prevPunctRate = Math.round((100 - prevLateRate) * 10) / 10;
    const punctDelta    = Math.round((punctRate - prevPunctRate) * 10) / 10;

    const pending       = this.leaveRequests.filter(lr => lr.status === 'pending').length;
    const cpBalances    = this.leaveBalances.filter(b => b.type === 'conge-paye');
    const totalEntitled = cpBalances.reduce((s, b) => s + (b.entitled  ?? 0), 0);
    const totalUsed     = cpBalances.reduce((s, b) => s + (b.used      ?? 0), 0);
    const utilRate      = totalEntitled > 0 ? Math.round((totalUsed / totalEntitled) * 1000) / 10 : 0;

    const overtime = Math.round(filtAtt.reduce((s, r) => s + (r.overtimeHours ?? 0), 0) * 10) / 10;
    const atRisk   = this.bradfordScores.filter(s => s.score >= 175).length;

    this.kpiCards = [
      {
        id: 'absrate', label: "Taux d'absentéisme", value: absRate.toFixed(1),
        delta: absDelta, unit: '%',
        status: absRate > 10 ? 'danger' : absRate > 6 ? 'warning' : 'good',
        tooltip: "Lignes isPresent=false / total lignes × 100\nPériode filtrée · Source : table attendance"
      },
      {
        id: 'util', label: 'Congés payés utilisés', value: utilRate.toFixed(1),
        delta: null, unit: '%',
        status: utilRate < 30 ? 'warning' : utilRate > 90 ? 'danger' : 'info',
        tooltip: "(Jours pris / 18j droits annuels) × 100\nSource : table leave_balances · type = conge-paye"
      },
      {
        id: 'overtime',
        label: this.filterPeriod === 'month' ? 'Heures supp. (mois)' : this.filterPeriod === 'quarter' ? 'Heures supp. (trimestre)' : 'Heures supp. (année)',
        value: overtime.toFixed(1),
        delta: null, unit: 'h',
        status: overtime > 100 ? 'warning' : 'info',
        tooltip: "Somme des overtime_hours sur la période filtrée\nSource : table attendance"
      },
      {
        id: 'at-risk', label: 'collaborateurs à risque', value: String(atRisk),
        delta: null, unit: '',
        status: atRisk > 5 ? 'danger' : atRisk > 2 ? 'warning' : 'good',
        actionLabel: atRisk > 0 ? 'Planifier entretiens' : undefined,
        tooltip: "Score Bradford = S² × D ≥ 175\nS = épisodes d'absence, D = jours totaux (52 semaines glissantes)"
      }
    ];
    this.checkAllThresholds();
  }

  private calcAbsRate(rows: Attendance[], _range?: { start: Date; end: Date }): number {
    // Fix #5 : exclure les enregistrements week-end du calcul
    const workingRows = rows.filter(r => {
      if (!r.attendanceDate) return true;
      const dow = new Date(r.attendanceDate).getDay();
      return dow !== 0 && dow !== 6;
    });
    if (!workingRows.length) return 0;
    const absentCount = workingRows.filter(r => !r.isPresent).length;
    return Math.round((absentCount / workingRows.length) * 1000) / 10;
  }

  private calcLateRate(rows: Attendance[], _range?: { start: Date; end: Date }): number {
    // Fix #5 : exclure les enregistrements week-end du calcul
    const workingRows = rows.filter(r => {
      if (!r.attendanceDate) return true;
      const dow = new Date(r.attendanceDate).getDay();
      return dow !== 0 && dow !== 6;
    });
    if (!workingRows.length) return 0;
    const lateCount = workingRows.filter(r => r.isLate).length;
    return Math.round((lateCount / workingRows.length) * 1000) / 10;
  }

  // ─── Funnel ────────────────────────────────────────────────────────────────

  private computeFunnel(leave: LeaveRequest[]): void {
    const total    = leave.length;
    const pending  = leave.filter(lr => lr.status === 'pending').length;
    const approved = leave.filter(lr => lr.status === 'approved').length;
    const rejected = leave.filter(lr => lr.status === 'rejected').length;
    const pct      = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
    this.funnelSteps = [
      { label: 'Soumises',   count: total,    pct: 100,         color: '#2563eb' },
      { label: 'En attente', count: pending,  pct: pct(pending),  color: '#f59e0b' },
      { label: 'Approuvées', count: approved, pct: pct(approved), color: '#16a34a' },
      { label: 'Rejetées',   count: rejected, pct: pct(rejected), color: '#dc2626' }
    ];
  }

  // ─── Balance list ──────────────────────────────────────────────────────────

  private computeBalanceList(): void {
    const byEmp = new Map<number, { remaining: number; entitled: number }>();
    for (const b of this.leaveBalances.filter(b => b.type === 'conge-paye')) {
      const prev = byEmp.get(b.employeeId) ?? { remaining: 0, entitled: 0 };
      byEmp.set(b.employeeId, {
        remaining: prev.remaining + (b.remaining ?? 0),
        entitled:  prev.entitled  + (b.entitled  ?? 0) + (b.carryOver ?? 0)
      });
    }
    const fullList = this.employees
      .filter(e => byEmp.has(e.id))
      .map(e => {
        const d   = byEmp.get(e.id)!;
        const pct = d.entitled > 0 ? Math.round((d.remaining / d.entitled) * 100) : 0;
        return { name: e.fullName, remaining: d.remaining, entitled: d.entitled, pct, alert: d.remaining <= 0 };
      });
    const count       = fullList.length || 1;
    const totalRem    = fullList.reduce((s, b) => s + b.remaining, 0);
    const atRiskCount = fullList.filter(b => b.remaining <= 5).length;
    const exhausted   = fullList.filter(b => b.remaining <= 0).length;
    this.balanceKpi  = {
      avg:           Math.round((totalRem / count) * 10) / 10,
      atRiskPct:     Math.round((atRiskCount / count) * 100),
      exhaustedCount: exhausted
    };
    this.balanceList = fullList
      .filter(b => b.remaining <= 5)
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 10);
  }

  // ─── Heatmap ───────────────────────────────────────────────────────────────

  private computeHeatmap(): void {
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();

    this.heatmapDays = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
      return {
        day:       i + 1,
        label:     String(i + 1),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isToday:   i + 1 === now.getDate()
      };
    });

    const range      = { start: monthStart, end: monthEnd };
    const absMonth   = this.enrichedAbsences.filter(a  => this.overlaps(a.startDate, a.endDate, range));
    const leaveMonth = this.leaveRequests   .filter(lr => lr.status === 'approved' && this.overlaps(lr.startDate, lr.endDate, range));
    const leaveEmpIds = new Set(leaveMonth.map(lr => lr.employeeId));
    const absEmpIds   = new Set(absMonth.map(a  => a.employeeId));
    const restEmpIds  = this.employees
      .filter(e => !leaveEmpIds.has(e.id) && !absEmpIds.has(e.id))
      .map(e => e.id);
    const prioritizedIds = [
      ...Array.from(leaveEmpIds),
      ...Array.from(absEmpIds).filter(id => !leaveEmpIds.has(id)),
      ...restEmpIds
    ];

    this.heatmapRows = prioritizedIds.map(empId => {
      const emp   = this.employees.find(e => e.id === empId);
      const cells: HeatmapCell[] = this.heatmapDays.map(d => {
        const date    = new Date(now.getFullYear(), now.getMonth(), d.day);
        const dateStr = this.toYmd(date);

        if (d.isWeekend) return { status: 'weekend', tooltip: `${dateStr} · Week-end` };

        // Congé approuvé visible même dans le futur
        const onLeave = leaveMonth.find(lr => lr.employeeId === empId && lr.startDate <= dateStr && lr.endDate >= dateStr);
        if (onLeave) return { status: 'leave',  tooltip: `${emp?.fullName ?? `#${empId}`} · ${dateStr} · Congé approuvé` };

        if (date > now) return { status: 'future',  tooltip: `${dateStr} · À venir` };

        const absent  = absMonth.find(a => a.employeeId === empId && a.startDate <= dateStr && a.endDate >= dateStr);
        if (absent)  return { status: 'absent', tooltip: `${emp?.fullName ?? `#${empId}`} · ${dateStr} · Absent` };

        const dayRecord = this.attendanceRows.find(r => r.employeeId === empId && r.attendanceDate === dateStr);
        return dayRecord
          ? { status: dayRecord.isLate ? 'late' : 'present', tooltip: `${emp?.fullName ?? `#${empId}`} · ${dateStr} · ${dayRecord.isLate ? 'Présent (retard)' : 'Présent'}` }
          : { status: 'nodata',  tooltip: `${emp?.fullName ?? `#${empId}`} · ${dateStr} · Non renseigné` };
      });
      return { employeeId: empId, name: emp?.fullName ?? `#${empId}`, cells };
    });
  }

  // ─── Gantt ─────────────────────────────────────────────────────────────────

  private computeGantt(): void {
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();

    this.ganttDays = Array.from({ length: daysInMonth }, (_, i) => ({
      day:   i + 1,
      label: (i + 1) % 5 === 1 ? String(i + 1) : ''
    }));

    const leaveMonth = this.leaveRequests.filter(lr =>
      (lr.status === 'approved' || lr.status === 'pending') &&
      this.overlaps(lr.startDate, lr.endDate, { start: monthStart, end: monthEnd })
    );

    const byEmp = new Map<number, GanttRow>();
    for (const lr of leaveMonth) {
      if (!byEmp.has(lr.employeeId)) {
        const emp = this.employees.find(e => e.id === lr.employeeId);
        byEmp.set(lr.employeeId, { employeeId: lr.employeeId, name: emp?.fullName ?? `#${lr.employeeId}`, blocks: [] });
      }
      const sd = new Date(Math.max(this.parseDate(lr.startDate).getTime(), monthStart.getTime()));
      const ed = new Date(Math.min(this.parseDate(lr.endDate).getTime(),   monthEnd.getTime()));
      byEmp.get(lr.employeeId)!.blocks.push({
        startDay: sd.getDate(), endDay: ed.getDate(),
        type:     lr.status === 'pending' ? 'pending' : lr.type,
        label:    `${lr.requestedDays}j`, overlap: false
      });
    }

    // Detect overlaps across different employees
    const empList = Array.from(byEmp.values());
    for (let i = 0; i < empList.length; i++) {
      for (const b1 of empList[i].blocks) {
        for (let j = i + 1; j < empList.length; j++) {
          for (const b2 of empList[j].blocks) {
            if (b1.startDay <= b2.endDay && b1.endDay >= b2.startDay) {
              b1.overlap = true; b2.overlap = true;
            }
          }
        }
      }
    }
    this.ganttRows = empList.slice(0, 15);
  }

  // ─── Alerts ────────────────────────────────────────────────────────────────

  private computeAlerts(): void {
    const msgs: string[] = [];
    const pending  = this.leaveRequests.filter(lr => lr.status === 'pending').length;
    const critical = this.bradfordScores.filter(s => s.score >= 400).length;
    const zeroB    = this.leaveBalances.filter(b  => b.type === 'conge-paye' && (b.remaining ?? 0) <= 0).length;
    if (pending  > 0) msgs.push(`${pending} demande${pending > 1 ? 's' : ''} en attente`);
    if (critical > 0) msgs.push(`${critical} collaborateur${critical > 1 ? 's' : ''} Bradford critique`);
    if (zeroB    > 0) msgs.push(`${zeroB} solde${zeroB > 1 ? 's' : ''} épuisé${zeroB > 1 ? 's' : ''}`);
    this.alertMessages = msgs;
  }

  // ─── Chart rendering ───────────────────────────────────────────────────────

  private renderAllCharts(): void {
    this.renderTrendChart();
    this.renderLateWdChart();
    this.renderDeptAbsChart();
    this.renderDurationChart();
    this.renderOtDeptChart();
    this.renderScatterChart();
    this.renderRecidivismChart();
    this.renderSeasonalChart();
    this.renderRadarRhChart();
  }

  private dc(id: string): void {
    this.charts.get(id)?.destroy();
    this.charts.delete(id);
  }

  // 4a – Trend line chart (12 months rolling) — global absenteeism rate (%)
  private renderTrendChart(): void {
    if (!this.trendCanvas) return;
    this.dc('trend');
    const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const now = new Date();
    const labels: string[] = [];
    const rates:  number[] = [];

    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = mStart.getFullYear(), m = mStart.getMonth();
      const mEnd   = new Date(y, m + 1, 0);
      labels.push(`${MONTHS[m]} ${String(y).slice(2)}`);
      const monthAbs = this.enrichedAbsences.filter(a => {
        const s = new Date(a.startDate);
        return s.getFullYear() === y && s.getMonth() === m;
      });
      const absDays  = monthAbs.reduce((s, a) => s + a.totalDays, 0);
      const wd       = Math.max(1, this.countWeekdays(mStart, mEnd));
      const empCount = Math.max(1, this.employees.length);
      rates.push(Math.round((absDays / (wd * empCount)) * 1000) / 10);
    }

    const threshold = this.getKpiThreshold('absenteisme');
    const datasets: ChartDataset<'line', number[]>[] = [
      {
        label: "Taux d'absentéisme (%)",
        data: rates,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        fill: true, tension: 0.3, pointRadius: 3
      }
    ];
    if (threshold?.thresholdValue != null) {
      datasets.push({
        label: `Seuil alerte ${threshold.thresholdValue} %`,
        data: labels.map(() => Number(threshold.thresholdValue)),
        borderColor: '#ef4444',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0
      });
    }
    if (threshold?.targetValue != null) {
      datasets.push({
        label: `Objectif cible ${threshold.targetValue} %`,
        data: labels.map(() => Number(threshold.targetValue)),
        borderColor: '#16a34a',
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0
      });
    }

    this.charts.set('trend', new Chart(this.trendCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, padding: 12, boxWidth: 10 } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => `${v}%` } },
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 } }
        }
      }
    }));
  }

  // 4b – Late by weekday
  private renderLateWdChart(): void {
    if (!this.lateWdCanvas) return;
    this.dc('lateWd');
    const range    = this.filterRange;
    const lateRows = this.attendanceRows.filter(r => {
      if (!r.attendanceDate || !r.isLate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= range.start && d <= range.end;
    });
    const byDow = [0, 0, 0, 0, 0];
    for (const r of lateRows) {
      const dow = this.parseDate(r.attendanceDate).getDay();
      if (dow >= 1 && dow <= 5) { byDow[dow - 1]++; }
    }
    const rounded = byDow.map(v => Math.round(v * 10) / 10);
    const avg     = rounded.reduce((s, v) => s + v, 0) / 5 || 1;
    const colors  = rounded.map(v => v > avg * 1.3 ? '#dc2626' : v > avg * 0.8 ? '#f59e0b' : '#16a34a');

    this.charts.set('lateWd', new Chart(this.lateWdCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['Lun','Mar','Mer','Jeu','Ven'],
        datasets: [{ label: 'Retards', data: rounded, backgroundColor: colors, borderRadius: 5, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} retards` } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => Math.round(Number(v)).toString() } },
          x: { grid: { display: false }, ticks: { color: '#64748b' } }
        }
      }
    }));
  }

  // 5a – Dept absenteeism (horizontal bars)
  private renderDeptAbsChart(): void {
    if (!this.deptAbsCanvas) return;
    this.dc('deptAbs');
    const range = this.filterRange;
    const data  = this.departments.map(dept => {
      const dAbs = this.enrichedAbsences.filter(a => a.department === dept.name && this.overlaps(a.startDate, a.endDate, range));
      const wd   = Math.max(1, this.countWeekdays(range.start, range.end));
      const days = dAbs.reduce((s, a) => s + a.totalDays, 0);
      return { name: dept.name, rate: dept.headcount > 0 ? Math.round((days / (dept.headcount * wd)) * 1000) / 10 : 0 };
    }).sort((a, b) => b.rate - a.rate);
    const colors = data.map(d => d.rate > 7 ? '#dc2626' : d.rate > 4 ? '#f59e0b' : '#16a34a');

    this.charts.set('deptAbs', new Chart(this.deptAbsCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(d => d.name),
        datasets: [{ label: 'Taux %', data: data.map(d => d.rate), backgroundColor: colors, borderRadius: 5, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}%` } } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', callback: v => `${v}%` } },
          y: { grid: { display: false }, ticks: { color: '#334155', font: { size: 11 } } }
        }
      }
    }));
  }

  // 5b – Absence duration distribution (donut)
  private renderDurationChart(): void {
    if (!this.durationCanvas) return;
    this.dc('duration');
    const range   = this.filterRange;
    const abs     = this.enrichedAbsences.filter(a => this.overlaps(a.startDate, a.endDate, range));
    const buckets = [0, 0, 0, 0];
    for (const a of abs) {
      if      (a.totalDays <= 1) buckets[0]++;
      else if (a.totalDays <= 3) buckets[1]++;
      else if (a.totalDays <= 7) buckets[2]++;
      else                       buckets[3]++;
    }

    this.charts.set('duration', new Chart(this.durationCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['1 jour','2-3 jours','4-7 jours','+1 semaine'],
        datasets: [{ data: buckets, backgroundColor: ['#2563eb','#0ea5e9','#f59e0b','#dc2626'], borderWidth: 0, hoverOffset: 5 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'DM Sans', size: 11 }, padding: 8, boxWidth: 10 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${abs.length > 0 ? Math.round((ctx.parsed / abs.length) * 100) : 0}%)` } }
        }
      }
    }));
  }

  // 5c – Overtime by department
  private renderOtDeptChart(): void {
    if (!this.otDeptCanvas) return;
    this.dc('otDept');
    const range   = this.filterRange;
    const filtAtt = this.attendanceRows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= range.start && d <= range.end;
    });
    const byDept  = new Map<string, number>();
    for (const r of filtAtt) {
      const dept = this.employees.find(e => e.id === r.employeeId)?.department ?? 'N/A';
      byDept.set(dept, (byDept.get(dept) ?? 0) + (r.overtimeHours ?? 0));
    }
    const data = Array.from(byDept.entries())
      .map(([n, h]) => ({ name: n, hours: Math.round(h * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);

    this.charts.set('otDept', new Chart(this.otDeptCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(d => d.name),
        datasets: [{ label: 'Heures', data: data.map(d => d.hours), backgroundColor: '#3b82f6', borderRadius: 4, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x}h` } } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', callback: v => `${v}h` } },
          y: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }
        }
      }
    }));
  }

  // 7a – Scatter: OT vs absenteeism
  private renderScatterChart(): void {
    if (!this.scatterCanvas) return;
    this.dc('scatter');
    const range = this.filterRange;
    const pts = this.employees.map(emp => {
      const att = this.attendanceRows.filter(r => {
        if (!r.attendanceDate) return false;
        const d = this.parseDate(r.attendanceDate);
        return r.employeeId === emp.id && d >= range.start && d <= range.end;
      });
      const wd = att.length > 0 ? att.length : Math.max(1, this.countWeekdays(range.start, range.end));
      const totalAbsDays = att.filter(r => !r.isPresent).length;
      const absRate = Math.round((totalAbsDays / wd) * 1000) / 10;
      const ot      = Math.round(att.reduce((s, r) => s + (r.overtimeHours ?? 0), 0) * 10) / 10;
      return { x: ot, y: absRate, name: emp.fullName };
    }).filter(p => p.x > 0 || p.y > 0);

    const red   = pts.filter(p =>  p.x > 20 && p.y > 5).map(p => ({ x: p.x, y: p.y, name: p.name }));
    const amber = pts.filter(p => (p.x > 20 || p.y > 5) && !(p.x > 20 && p.y > 5)).map(p => ({ x: p.x, y: p.y, name: p.name }));
    const blue  = pts.filter(p =>  p.x <= 20 && p.y <= 5).map(p => ({ x: p.x, y: p.y, name: p.name }));

    // ─ Pearson r + regression line ─────────────────────────────────────────
    let regressionData: { x: number; y: number }[] = [];
    if (pts.length >= 2) {
      const n       = pts.length;
      const meanX   = pts.reduce((s, p) => s + p.x, 0) / n;
      const meanY   = pts.reduce((s, p) => s + p.y, 0) / n;
      const cov     = pts.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
      const varX    = pts.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
      const varY    = pts.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
      const slope   = varX > 0 ? cov / varX : 0;
      const inter   = meanY - slope * meanX;
      const r       = (varX > 0 && varY > 0) ? cov / Math.sqrt(varX * varY) : 0;
      const rRnd    = Math.round(r * 100) / 100;
      const allX    = pts.map(p => p.x);
      const minX    = Math.min(...allX), maxX = Math.max(...allX);
      regressionData = [
        { x: minX, y: Math.round((slope * minX + inter) * 100) / 100 },
        { x: maxX, y: Math.round((slope * maxX + inter) * 100) / 100 }
      ];
      let label: string, color: string;
      if      (r >  0.5) { label = 'corrélation positive forte';    color = '#dc2626'; }
      else if (r >  0.2) { label = 'corrélation positive modérée';  color = '#f59e0b'; }
      else if (r > -0.2) { label = 'corrélation nulle';             color = '#94a3b8'; }
      else if (r > -0.5) { label = 'corrélation négative modérée';  color = '#2563eb'; }
      else               { label = 'corrélation négative forte';    color = '#16a34a'; }
      this.scatterCorrelation = { r: rRnd, label, color };
    } else {
      this.scatterCorrelation = { r: 0, label: '', color: '#94a3b8' };
    }
    // ───────────────────────────────────────────────────────────────────────

    this.charts.set('scatter', new Chart(this.scatterCanvas.nativeElement, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Zone burn-out',  data: red,   backgroundColor: 'rgba(220,38,38,0.75)', pointRadius: 6 },
          { label: 'Zone attention', data: amber,  backgroundColor: 'rgba(245,158,11,0.75)', pointRadius: 6 },
          { label: 'Zone normale',   data: blue,   backgroundColor: 'rgba(37,99,235,0.65)',  pointRadius: 5 },
          {
            type: 'line' as const, label: 'Tendance',
            data: regressionData,
            borderColor: '#94a3b8', borderWidth: 1.5, pointRadius: 0,
            borderDash: [4, 4], backgroundColor: 'transparent', fill: false
          } as any
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, filter: (item: any) => item.text !== 'Tendance' } },
          tooltip: { callbacks: { label: ctx => { const d = ctx.raw as any; return ` ${d.name ?? ''} — ${d.x}h · ${d.y}% abs`; } } }
        },
        scales: {
          x: { title: { display: true, text: 'Heures supp.', color: '#64748b', font: { size: 11 } }, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b' } },
          y: { title: { display: true, text: "Taux d'absentéisme %", color: '#64748b', font: { size: 11 } }, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', callback: v => `${v}%` } }
        }
      }
    }));
  }

  // 7b – Recidivism bars
  private renderRecidivismChart(): void {
    if (!this.recidCanvas) return;
    this.dc('recid');
    const range   = this.filterRange;
    const filtAbs = this.enrichedAbsences.filter(a => this.overlaps(a.startDate, a.endDate, range));
    const episodeCount = new Map<number, number>();
    for (const a of filtAbs) {
      episodeCount.set(a.employeeId, (episodeCount.get(a.employeeId) ?? 0) + 1);
    }
    const buckets = [0, 0, 0, 0];
    for (const [, c] of episodeCount) {
      if      (c === 1) buckets[0]++;
      else if (c === 2) buckets[1]++;
      else if (c === 3) buckets[2]++;
      else              buckets[3]++;
    }

    this.charts.set('recid', new Chart(this.recidCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: ['1 épisode','2 épisodes','3 épisodes','4+ (chroniques)'],
        datasets: [{ data: buckets, backgroundColor: ['#16a34a','#0ea5e9','#f59e0b','#dc2626'], borderRadius: 5, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} collaborateur${ctx.parsed.y !== 1 ? 's' : ''}` } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', callback: v => Math.round(Number(v)).toString() } },
          x: { grid: { display: false }, ticks: { color: '#64748b' } }
        }
      }
    }));
  }

  // ─── Seasonal forecast (existing) ─────────────────────────────────────────

  get seasonalForecastData(): {
    labels: string[];
    historical: number[];
    currentYear: (number | null)[];
    forecast: (number | null)[];
    forecastYear: number;
  } {
    const MONTH_LABELS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const now      = new Date();
    const curYear  = now.getFullYear();
    const curMonth = now.getMonth();

    const byYearMonth = new Map<string, number>();
    const yearSet     = new Set<number>();
    for (const a of this.enrichedAbsences) {
      const start = new Date(a.startDate);
      const end   = new Date((a as any).endDate ?? a.startDate);
      if (isNaN(start.getTime())) continue;
      const cursor   = new Date(start.getFullYear(), start.getMonth(), 1);
      const endMonth = new Date(
        isNaN(end.getTime()) ? start.getFullYear() : end.getFullYear(),
        isNaN(end.getTime()) ? start.getMonth()    : end.getMonth(),
        1
      );
      while (cursor <= endMonth) {
        const y = cursor.getFullYear(), m = cursor.getMonth();
        const key = `${y}-${m}`;
        byYearMonth.set(key, (byYearMonth.get(key) ?? 0) + 1);
        yearSet.add(y);
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    const pastYears = Array.from(yearSet).filter(y => y < curYear);
    const historical: number[] = Array.from({ length: 12 }, (_, m) => {
      if (pastYears.length === 0) return 0;
      const total = pastYears.reduce((sum, y) => sum + (byYearMonth.get(`${y}-${m}`) ?? 0), 0);
      return Math.round((total / pastYears.length) * 10) / 10;
    });

    const baseline: number[] = pastYears.length > 0
      ? historical
      : Array.from({ length: 12 }, (_, m) => byYearMonth.get(`${curYear}-${m}`) ?? 0);

    const currentYearData: (number | null)[] = Array.from({ length: 12 }, (_, m) =>
      m <= curMonth ? (byYearMonth.get(`${curYear}-${m}`) ?? 0) : null
    );

    const iaForecast = this.buildIaForecast(baseline, curMonth);
    const forecast: (number | null)[] = iaForecast ?? Array.from({ length: 12 }, (_, m) =>
      m > curMonth ? baseline[m] : null
    );

    return { labels: MONTH_LABELS, historical: baseline, currentYear: currentYearData, forecast, forecastYear: curYear };
  }

  /** Prévision IA : moyenne pondérée des risk_proba × effectif, modulée par le profil saisonnier. */
  private buildIaForecast(
    historical: number[],
    curMonth: number
  ): (number | null)[] | null {
    if (!this.iaRisks.length) {
      return null;
    }

    const weightedAvg = this.iaRisks.reduce((s, r) => s + r.riskProba, 0) / this.iaRisks.length;
    const avgHist = historical.reduce((a, b) => a + b, 0) / 12 || 1;
    const empCount = Math.max(1, this.employees.length);

    return Array.from({ length: 12 }, (_, m) => {
      if (m <= curMonth) {
        return null;
      }
      const seasonalWeight = historical[m] / avgHist;
      const projected = weightedAvg * empCount * seasonalWeight;
      return Math.round(projected * 10) / 10;
    });
  }

  private renderSeasonalChart(): void {
    if (!this.seasonalCanvas) return;
    this.dc('seasonal');
    const d = this.seasonalForecastData;

    this.charts.set('seasonal', new Chart(this.seasonalCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: d.labels,
        datasets: [
          {
            type: 'bar' as const,
            label: 'Moyenne saisonnière (historique)',
            data: d.historical,
            backgroundColor: 'rgba(37,99,235,0.12)',
            borderColor:     'rgba(37,99,235,0.35)',
            borderWidth: 1, borderRadius: 4, order: 3
          },
          {
            type: 'line' as const,
            label: `Réel ${d.forecastYear}`,
            data: d.currentYear,
            borderColor: '#2563eb', backgroundColor: 'transparent',
            borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#2563eb',
            tension: 0.35, spanGaps: false, order: 1
          },
          {
            type: 'line' as const,
            label: 'Prévision saisonnière',
            data: d.forecast,
            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.07)',
            borderWidth: 2, borderDash: [6, 4], pointRadius: 4, pointBackgroundColor: '#f59e0b',
            tension: 0.35, spanGaps: false, order: 2
          } as any
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 16 } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y ?? '—'} absence(s)` } }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { font: { size: 11 }, callback: v => Math.round(Number(v)).toString() },
            title: { display: true, text: 'Absences', font: { size: 11 } },
            grid: { color: '#f1f5f9' }
          },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    }));
  }

  // ─── Bradford ──────────────────────────────────────────────────────────────

  computeBradfordScore(employeeId: number): BradfordScore {
    const employee = this.employees.find(e => e.id === employeeId);
    // Standard Bradford : fenêtre glissante de 52 semaines (364 jours)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 364);
    const cutoffStr = this.toYmd(cutoff);
    const absences = this.enrichedAbsences.filter(
      a => a.employeeId === employeeId && a.endDate >= cutoffStr
    );
    // Chaque EnrichedAbsence représente déjà un épisode distinct (construit par buildEnrichedAbsences).
    // S = nombre d'épisodes distincts, D = total des jours.
    const occurrences = absences.length;
    const totalDays = absences.reduce((sum, a) => sum + a.totalDays, 0);
    const score     = occurrences * occurrences * totalDays;
    let riskLevel: BradfordScore['riskLevel'] = 'low';
    if      (score >= 400) riskLevel = 'critical';
    else if (score >= 175) riskLevel = 'high';
    else if (score >= 50)  riskLevel = 'medium';
    return {
      employeeId,
      employeeName: employee?.fullName ?? `collaborateur #${employeeId}`,
      department:   employee?.department ?? 'N/A',
      score, occurrences, totalDays, riskLevel
    };
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  getTensionLevelLabel(score: number): string {
    if (score >= 67) return 'Critique';
    if (score >= 34) return 'Modéré';
    return 'Normal';
  }

  getTensionLevelClass(score: number): string {
    if (score >= 67) return 'tension-critique';
    if (score >= 34) return 'tension-modere';
    return 'tension-normal';
  }

  getTensionColor(score: number): string {
    if (score >= 67) return 'var(--color-text-danger, #dc2626)';
    if (score >= 34) return 'var(--color-text-warning, #d97706)';
    return 'var(--color-text-success, #16a34a)';
  }

  getTensionBarColor(score: number): string {
    if (score >= 67) return '#dc2626';
    if (score >= 34) return '#f59e0b';
    return '#16a34a';
  }

  getRiskClass(level: string): string { return `risk-${level}`; }

  getRiskLabel(level: string): string {
    const map: Record<string, string> = { low: 'Faible', medium: 'Modéré', high: 'Élevé', critical: 'Critique' };
    return map[level] ?? level;
  }

  getIaRiskBarColor(level: RiskLevel): string {
    const map: Record<RiskLevel, string> = {
      HIGH: '#ef4444',
      MEDIUM: '#f59e0b',
      LOW: '#22c55e'
    };
    return map[level];
  }

  getIaRiskBadgeLabel(level: RiskLevel): string {
    const map: Record<RiskLevel, string> = {
      HIGH: 'ÉLEVÉ',
      MEDIUM: 'MOYEN',
      LOW: 'FAIBLE'
    };
    return map[level];
  }

  getIaRiskBadgeClass(level: RiskLevel): string {
    const map: Record<RiskLevel, string> = {
      HIGH: 'risk-high',
      MEDIUM: 'risk-medium',
      LOW: 'risk-low'
    };
    return map[level];
  }

  getBalanceClass(remaining: number): string {
    return remaining <= 0 ? 'balance-zero' : remaining <= 5 ? 'balance-low' : 'balance-ok';
  }

  getGanttBlockStyle(block: GanttBlock, daysInMonth: number): { [key: string]: string } {
    return {
      left:  `${((block.startDay - 1) / daysInMonth) * 100}%`,
      width: `${((block.endDay - block.startDay + 1) / daysInMonth) * 100}%`
    };
  }

  // ─── HR Tension computation ───────────────────────────────────────────────

  private computeHrTension(): void {
    const absSeuilVal = this.getKpiThreshold('absenteisme')?.thresholdValue ?? 10;
    const range = this.filterRange;
    const prev  = this.prevRange;

    const deptForGlobal = this.filterDepartment;
    this.hrTensionScore = this.calcTensionScore(range, absSeuilVal, deptForGlobal);
    const prevScore     = this.calcTensionScore(prev,  absSeuilVal, deptForGlobal);
    this.hrTensionDelta = this.hrTensionScore - prevScore;

    const deptScores = this.departments
      .map(d => ({ name: d.name, score: this.calcTensionScore(range, absSeuilVal, d.name) }))
      .sort((a, b) => b.score - a.score);
    this.hrTensionDeptScores = deptScores.slice(0, 3);
  }

  private calcTensionScore(
    range: { start: Date; end: Date },
    absSeuilVal: number,
    dept: string
  ): number {
    const filtAtt = this.attendanceRows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= range.start && d <= range.end &&
        (!dept || this.employees.find(e => e.id === r.employeeId)?.department === dept);
    });

    // 1) Absence rate
    const absRate = filtAtt.length > 0
      ? (filtAtt.filter(r => !r.isPresent).length / filtAtt.length) * 100
      : 0;

    // 2) Refused / submitted leave ratio
    const filtLeave = this.leaveRequests.filter(lr =>
      this.overlaps(lr.startDate, lr.endDate, range) &&
      (!dept || this.employees.find(e => e.id === lr.employeeId)?.department === dept)
    );
    const nbSoumis   = filtLeave.length;
    const nbRefuses  = filtLeave.filter(lr => lr.status === 'rejected').length;
    const leaveRatio = nbSoumis > 0 ? nbRefuses / nbSoumis : 0;

    // 3) Average overtime per employee per week
    const empCount = dept
      ? Math.max(1, this.employees.filter(e => e.department === dept).length)
      : Math.max(1, this.employees.length);
    const diffDays  = Math.max(7, (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24));
    const weeks     = diffDays / 7;
    const totalOT   = filtAtt.reduce((s, r) => s + (r.overtimeHours ?? 0), 0);
    const avgOT     = totalOT / (empCount * weeks);

    const s1 = (absRate / Math.max(0.1, absSeuilVal)) * 40;
    const s2 = leaveRatio * 30;
    const s3 = (avgOT / Math.max(0.1, this.OT_SEUIL_HEURES)) * 30;

    return Math.min(100, Math.max(0, Math.round(s1 + s2 + s3)));
  }

  // ─── Private utils ─────────────────────────────────────────────────────────

  private countEpisodesAbove(min: number, range?: { start: Date; end: Date }): number {
    const source = range
      ? this.enrichedAbsences.filter(a => this.overlaps(a.startDate, a.endDate, range))
      : this.enrichedAbsences;
    const ec = new Map<number, number>();
    for (const a of source) ec.set(a.employeeId, (ec.get(a.employeeId) ?? 0) + 1);
    let n = 0;
    for (const [, c] of ec) if (c >= min) n++;
    return n;
  }

  private overlaps(startStr: string, endStr: string, range: { start: Date; end: Date }): boolean {
    if (!startStr) return false;
    const s = this.parseDate(startStr);
    const e = endStr ? this.parseDate(endStr) : s;
    return s <= range.end && e >= range.start;
  }

  private parseDate(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private toYmd(date: Date): string { return date.toISOString().slice(0, 10); }

  private countWeekdays(start: Date, end: Date): number {
    let count = 0;
    const c   = new Date(start);
    while (c <= end) { if (c.getDay() !== 0 && c.getDay() !== 6) count++; c.setDate(c.getDate() + 1); }
    return count;
  }

  // 7f – Radar: Profil santé RH par département
  private renderRadarRhChart(): void {
    if (!this.radarRhCanvas) return;
    this.dc('radarRh');

    const range    = this.filterRange;
    const AXES     = ['Absentéisme', 'Retards', 'H. supp.', 'Congés utilisés', 'Bradford'];
    const SEUIL_OT = this.OT_SEUIL_HEURES;

    // ── Axis 1 : Absenteeism rate per dept ─────────────────────────────────
    const absRateByDept = new Map<string, number>();
    for (const dept of this.departments) {
      const dAbs = this.enrichedAbsences.filter(
        a => a.department === dept.name && this.overlaps(a.startDate, a.endDate, range)
      );
      const wd   = Math.max(1, this.countWeekdays(range.start, range.end));
      const days = dAbs.reduce((s, a) => s + a.totalDays, 0);
      absRateByDept.set(dept.name, dept.headcount > 0 ? (days / (dept.headcount * wd)) * 100 : 0);
    }

    // ── Axis 2 : Late count per dept ────────────────────────────────────────
    const lateByDept = new Map<string, number>();
    for (const r of this.attendanceRows) {
      if (!r.attendanceDate || !r.isLate) continue;
      const d = this.parseDate(r.attendanceDate);
      if (d < range.start || d > range.end) continue;
      const dept = this.employees.find(e => e.id === r.employeeId)?.department ?? '';
      if (dept) lateByDept.set(dept, (lateByDept.get(dept) ?? 0) + 1);
    }
    const maxLate = Math.max(1, ...Array.from(lateByDept.values()));

    // ── Axis 3 : Avg OT per employee per dept ──────────────────────────────
    const otByDept = new Map<string, number>();
    const filtAtt  = this.attendanceRows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = this.parseDate(r.attendanceDate);
      return d >= range.start && d <= range.end;
    });
    for (const r of filtAtt) {
      const dept = this.employees.find(e => e.id === r.employeeId)?.department ?? '';
      if (dept) otByDept.set(dept, (otByDept.get(dept) ?? 0) + (r.overtimeHours ?? 0));
    }

    // ── Axis 4 : Avg leave utilization ratio per dept ──────────────────────
    const leaveRatioByDept = new Map<string, { sum: number; count: number }>();
    for (const bal of this.leaveBalances) {
      if (bal.entitled <= 0) continue;
      const dept = this.employees.find(e => e.id === bal.employeeId)?.department ?? '';
      if (!dept) continue;
      const acc = leaveRatioByDept.get(dept) ?? { sum: 0, count: 0 };
      acc.sum += bal.used / bal.entitled;
      acc.count++;
      leaveRatioByDept.set(dept, acc);
    }

    // ── Axis 5 : Avg Bradford score per dept ───────────────────────────────
    const bradfordByDept = new Map<string, { sum: number; count: number }>();
    for (const bs of this.bradfordScores) {
      const dept = this.employees.find(e => e.id === bs.employeeId)?.department ?? bs.department;
      if (!dept) continue;
      const acc = bradfordByDept.get(dept) ?? { sum: 0, count: 0 };
      acc.sum += bs.score;
      acc.count++;
      bradfordByDept.set(dept, acc);
    }

    // ── Helper: compute 5 normalised values (0–10) ─────────────────────────
    const computeValues = (deptName: string, headcount: number): number[] => {
      const v1 = Math.min(10, ((absRateByDept.get(deptName) ?? 0) / 20) * 10);
      const v2 = Math.min(10, ((lateByDept.get(deptName) ?? 0) / maxLate) * 10);
      const totalOT = otByDept.get(deptName) ?? 0;
      const v3 = Math.min(10, (totalOT / Math.max(1, headcount) / SEUIL_OT) * 10);
      const bal = leaveRatioByDept.get(deptName);
      const v4 = bal && bal.count > 0 ? Math.min(10, (bal.sum / bal.count) * 10) : 0;
      const brad = bradfordByDept.get(deptName);
      const v5 = brad && brad.count > 0 ? Math.min(10, (brad.sum / brad.count / 500) * 10) : 0;
      return [v1, v2, v3, v4, v5];
    };

    // ── Build datasets ─────────────────────────────────────────────────────
    const datasets: any[] = [];

    this.departments.forEach((dept, i) => {
      const color   = this.RADAR_DEPT_COLORS[i % this.RADAR_DEPT_COLORS.length];
      const visible = this.radarSelectedDepts.size === 0 || this.radarSelectedDepts.has(dept.name);
      if (visible) {
        datasets.push({
          label: dept.name,
          data: computeValues(dept.name, dept.headcount),
          borderColor: color,
          backgroundColor: this.hexToRgba(color, 0.12),
          borderWidth: 2, pointRadius: 3
        });
      }
    });

    this.radarRhLegendItems = this.departments.map((dept, i) => ({
      label: dept.name,
      color: this.RADAR_DEPT_COLORS[i % this.RADAR_DEPT_COLORS.length],
      active: this.radarSelectedDepts.size === 0 || this.radarSelectedDepts.has(dept.name)
    }));

    this.charts.set('radarRh', new Chart(this.radarRhCanvas.nativeElement, {
      type: 'radar',
      data: { labels: AXES, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 10,
            ticks: { display: false },
            pointLabels: { font: { size: 12 } },
            grid: { color: '#e2e8f0' },
            angleLines: { color: '#e2e8f0' }
          }
        }
      }
    }));
  }

  toggleRadarDept(label: string): void {
    // Reassign Set so Angular change detection picks it up
    const next = new Set(this.radarSelectedDepts);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    this.radarSelectedDepts = next;
    // Update legend immediately (in-zone, so CD fires this tick)
    this.radarRhLegendItems = this.departments.map((dept, i) => ({
      label: dept.name,
      color: this.RADAR_DEPT_COLORS[i % this.RADAR_DEPT_COLORS.length],
      active: this.radarSelectedDepts.size === 0 || this.radarSelectedDepts.has(dept.name)
    }));
    // Redraw canvas asynchronously
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.renderRadarRhChart(), 0);
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
