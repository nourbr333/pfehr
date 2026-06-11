import { CommonModule, isPlatformBrowser } from '@angular/common';
import {

  ChangeDetectorRef,
  Component,

  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID,

  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { catchError, finalize } from 'rxjs/operators';
import { forkJoin, of, Subscription } from 'rxjs';

import { AuthService, Utilisateur } from '../../services/auth';
import { ToastService } from '../../components/toast/toast.service';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import {
  AbsenceData,
  AbsenceEntry,
  AbsenceType,
  CalendarAbsenceDay,
  CreateLeaveRequestDto,
  DateRange,

  EmployeeTableRow,
  EnrichedAbsence,
  InstantAbsenceCard,
  InstantViewTab,
  LeaveBalance,
  LeavePolicy,
  LeaveRequest,
  LeaveStatus,
  PeriodPreset,

  TypeColorMap
} from './absences-conges.models';
import { TableauAbsencesComponent } from './components/tableau-absences.component';
import { CongesRequestsComponent } from './components/conges-requests/conges-requests.component';
import { LeaveBalanceComponent } from './components/leave-balance/leave-balance.component';
import { LeavePoliciesComponent } from './components/leave-policies/leave-policies.component';
import { AnalyticsAdvancedComponent } from './components/analytics-advanced/analytics-advanced.component';
import { LeaveRequestModalComponent } from './components/leave-request-modal/leave-request-modal.component';
import { LeaveRequestService } from './services/leave-request.service';
import { LeaveBalanceService } from './services/leave-balance.service';
import { LeavePolicyService } from './services/leave-policy.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { KpiThresholdService } from '../../services/kpi-threshold.service';
import { NotificationService } from '../../services/notification.service';
import { KpiThresholdModalComponent } from '../../components/kpi-threshold-modal/kpi-threshold-modal.component';
import {
  KpiKey,
  isKpiKey,
  isThresholdBreached as kpiIsBreached,
  isTargetAchieved as kpiIsTargetAchieved,
  KPI_THRESHOLD_DEFINITIONS
} from '../../models/kpi-threshold.config';

@Component({
  selector: 'app-absences-conges',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    TableauAbsencesComponent,
    CongesRequestsComponent,
    LeaveBalanceComponent,
    LeavePoliciesComponent,
    AnalyticsAdvancedComponent,
    LeaveRequestModalComponent,
    NotificationsPanelComponent,
    KpiThresholdModalComponent
  ],
  templateUrl: './absences-conges.component.html',
  styleUrl: './absences-conges.component.scss'
})
export class AbsencesCongesComponent implements OnInit, OnDestroy {


  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly leaveRequestService = inject(LeaveRequestService);
  private readonly leaveBalanceService = inject(LeaveBalanceService);
  private readonly leavePolicyService = inject(LeavePolicyService);
  private readonly kpiThresholdService = inject(KpiThresholdService);
  private readonly notificationService = inject(NotificationService);

  readonly utilisateur: Utilisateur | null = this.auth.getCurrentUser();
  readonly weekLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  readonly instantTabs: Array<{ key: InstantViewTab; label: string }> = [
    { key: 'today', label: "Aujourd'hui" },
    { key: 'week', label: 'Cette semaine' },
    { key: 'month', label: 'Ce mois' }
  ];

  readonly periodOptions: Array<{ value: PeriodPreset; label: string }> = [
    { value: 'all', label: 'Tout l\'historique' },
    { value: 'today', label: "Aujourd'hui" },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
    { value: 'custom', label: 'Plage personnalisï¿½e' }
  ];
  readonly absenceTypes: AbsenceType[] = ['conge-paye', 'maladie', 'sans-solde', 'evenement-familial', 'autre'];

  readonly typeColors: TypeColorMap = {
    'conge-paye': { bg: '#dcfce7', text: '#166534', label: 'Congé payé' },
    'maladie': { bg: '#ffedd5', text: '#9a3412', label: 'Maladie' },
    'sans-solde': { bg: '#e5e7eb', text: '#374151', label: 'Sans solde' },
    'evenement-familial': { bg: '#ede9fe', text: '#5b21b6', label: 'Événement familial' },
    'autre': { bg: '#f3f4f6', text: '#4b5563', label: 'Autre' }
  };
  readonly mockData: AbsenceData = { departments: [], employees: [], absences: [] };
  enrichedAbsences: EnrichedAbsence[] = [];
  cachedTableRows: EmployeeTableRow[] = [];
  departmentColors: Record<string, string> = {};
  isLoading = false;
  attendanceRows: Attendance[] = [];
  private attendanceByEmployee = new Map<number, Attendance>();
  attendanceLoading = false;
  attendanceError = '';
  showImportModal = false;
  selectedImportFile: File | null = null;
  importFileError = '';
  importInProgress = false;
  private importWatchdogId: ReturnType<typeof setTimeout> | null = null;
  private importRequestSub: Subscription | null = null;

  selectedPeriod: 'month' | 'quarter' | 'year' = 'month';
  selectedDepartment = '';
  selectedAbsenceType: AbsenceType | '' = '';
  selectedEmployee = '';
  customStartDate = '';
  customEndDate = '';

  thresholdModalOpen = false;
  thresholdModalKpiKey: KpiKey = 'absenteisme';
  thresholdModalKpiLabel = '';

  readonly kpiDefinitions: Record<string, { label: string; formula: string; target: string }> = {
    absenteisme: { label: KPI_THRESHOLD_DEFINITIONS.absenteisme.label, formula: KPI_THRESHOLD_DEFINITIONS.absenteisme.formula, target: KPI_THRESHOLD_DEFINITIONS.absenteisme.suggestedTarget },
    retard:      { label: KPI_THRESHOLD_DEFINITIONS.retard.label, formula: KPI_THRESHOLD_DEFINITIONS.retard.formula, target: KPI_THRESHOLD_DEFINITIONS.retard.suggestedTarget }
  };
  instantTab: InstantViewTab = 'today';
  instantPage = 1;
  readonly instantPageSize = 10;
  displayMonth = new Date();
  /** True si l'API leave-requests a retournï¿½ une erreur (pour indicateur visuel KPI) */
  leaveDataUnavailable = false;

  // Tab management
  activeTab: 'absences' | 'conges' | 'soldes' | 'analytiques' = 'absences';
  showLeaveRequestModal = false;
  leaveRequests: LeaveRequest[] = [];
  leaveBalances: LeaveBalance[] = [];
  leavePolicies: LeavePolicy[] = [];

  get congePayeEntitled(): number {
    return this.leavePolicies.find(p => p.type === 'conge-paye')?.maxDaysPerYear ?? 18;
  }

  constructor() {}
  ngOnInit(): void {
    if (!this.utilisateur) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadAttendanceRows();
    this.loadLeaveData();
    this.kpiThresholdService.load();
  }

  ngOnDestroy(): void {
    this.clearImportWatchdog();
  }

  get monthLabel(): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.displayMonth);
  }

  get filteredAbsences(): EnrichedAbsence[] {
    const range = this.currentRange;
    return this.enrichedAbsences.filter((absence) => this.matchesGlobalFilters(absence, range));
  }

  get calendarDays(): CalendarAbsenceDay[] {
    const currentMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth(), 1);
    const monthStart = new Date(currentMonth);
    monthStart.setDate(1);
    const shift = (monthStart.getDay() + 6) % 7;
    monthStart.setDate(monthStart.getDate() - shift);

    const days: CalendarAbsenceDay[] = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(monthStart);
      day.setDate(monthStart.getDate() + index);
      const absences = this.filteredAbsences.filter((absence) => this.isInRange(day, this.parseDate(absence.startDate), this.parseDate(absence.endDate)));
      days.push({
        date: day,
        inCurrentMonth: day.getMonth() === this.displayMonth.getMonth(),
        absences,
        tensionDepartments: this.departmentsInTension(absences)
      });
    }
    return days;
  }

  get instantCards(): InstantAbsenceCard[] {
    const range = this.rangeForTab(this.instantTab);
    return this.enrichedAbsences
      .filter((absence) => this.matchesGlobalFilters(absence, range))
      .map((absence) => ({
        id: absence.id,
        employeeName: absence.employeeName,
        employeeAvatar: absence.employeeAvatar,
        type: absence.type,
        remainingLabel: this.remainingLabel(absence)
      }));
  }

  get instantTotal(): number {
    return this.instantCards.length;
  }

  get paginatedInstantCards(): InstantAbsenceCard[] {
    const start = (this.instantPage - 1) * this.instantPageSize;
    return this.instantCards.slice(start, start + this.instantPageSize);
  }

  get instantTotalPages(): number {
    return Math.max(1, Math.ceil(this.instantCards.length / this.instantPageSize));
  }

  get canInstantPrevious(): boolean {
    return this.instantPage > 1;
  }

  get canInstantNext(): boolean {
    return this.instantPage < this.instantTotalPages;
  }

  get absenteeismRateKpi(): number {
    return this.avgAbsenteeismForRows(this.kpiRows);
  }

  get absenteeismDeltaKpi(): number {
    // Delta M vs M-1 (affiché uniquement quand selectedPeriod === 'month')
    const curr = this.avgAbsenteeismForRows(this.kpiRows);
    const prev = this.avgAbsenteeismForRows(this.previousMonthAttendanceRows);
    return Number((curr - prev).toFixed(1));
  }

  get lateRateKpi(): number {
    return this.avgLateRateForRows(this.kpiRows);
  }

  get lateRateDeltaKpi(): number {
    // Delta M vs M-1 (affiché uniquement quand selectedPeriod === 'month')
    const curr = this.avgLateRateForRows(this.kpiRows);
    const prev = this.avgLateRateForRows(this.previousMonthAttendanceRows);
    return Number((curr - prev).toFixed(1));
  }

  /** Vrai si au moins une ligne d'attendance couvre le mois courant. */
  get hasDataForCurrentMonth(): boolean {
    return this.currentMonthAttendanceRows.length > 0;
  }

  /** Label du mois courant pour les messages "donnï¿½es indisponibles". */
  get currentMonthLabel(): string {
    return new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  // Calculï¿½s localement depuis leaveRequests (robuste si API KPI indisponible)
  get ongoingLeavesThisMonthKpi(): number {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.leaveRequests.filter(lr =>
      lr.status === 'approved' &&
      this.parseDate(lr.startDate) <= monthEnd &&
      this.parseDate(lr.endDate) >= monthStart
    ).length;
  }

  get pendingLeaveApprovalsKpi(): number {
    // Exclure les demandes dont la date de dï¿½but est dï¿½passï¿½e (effectivement ï¿½chuï¿½es)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.leaveRequests.filter(lr =>
      lr.status === 'pending' && this.parseDate(lr.startDate) >= today
    ).length;
  }

  absenteeismColorClass(rate: number): string {
    if (rate <= 3) return 'kpi-rate-green';
    if (rate <= 6) return 'kpi-rate-yellow';
    if (rate <= 10) return 'kpi-rate-orange';
    return 'kpi-rate-red';
  }

  lateColorClass(rate: number): string {
    if (rate <= 5) return 'kpi-rate-green';
    if (rate <= 10) return 'kpi-rate-yellow';
    if (rate <= 15) return 'kpi-rate-orange';
    return 'kpi-rate-red';
  }

  formatDeltaAbs(value: number): string {
    return Math.abs(value).toFixed(1) + '%';
  }

  /** Label discret indiquant la pï¿½riode couverte par les KPI absentï¿½isme/retard. */
  get kpiPeriodLabel(): string {
    return this.formatRangeLabel(this.currentRange);
  }

  /** Label discret pour les graphes qui utilisent currentRange. */
  get currentRangeLabel(): string {
    return this.formatRangeLabel(this.currentRange);
  }

  /** Label ï¿½vs mois dernierï¿½ pour la flï¿½che delta des KPI (comparaison M vs M-1). */
  get kpiDeltaPeriodsLabel(): string {
    const now  = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `vs ${prev.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
  }

  /**
   * Vrai si le delta absentï¿½isme M vs M-1 est significatif.
   * Faux si les mï¿½mes lignes d'import couvrent ï¿½ la fois M et M-1
   * (import cross-mois : le delta serait mï¿½caniquement proche de 0).
   */
  get isKpiDeltaMeaningful(): boolean {
    return this.selectedPeriod === 'month' &&
      this.currentMonthAttendanceRows.length > 0 && this.previousMonthAttendanceRows.length > 0;
  }

  private formatRangeLabel(range: DateRange): string {
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fmt(range.start)}\u2013${fmt(range.end)}`;
  }

  get top5Absents(): Array<{ name: string; avatar: string; department: string; totalDays: number }> {
    const byEmployee = new Map<number, { name: string; avatar: string; department: string; totalDays: number }>();
    this.filteredAbsences.forEach((a) => {
      const existing = byEmployee.get(a.employeeId);
      if (existing) {
        existing.totalDays += a.totalDays;
      } else {
        byEmployee.set(a.employeeId, {
          name: a.employeeName,
          avatar: a.employeeAvatar,
          department: a.department,
          totalDays: a.totalDays
        });
      }
    });
    return Array.from(byEmployee.values())
      .sort((a, b) => b.totalDays - a.totalDays)
      .slice(0, 5);
  }


  get tableRows(): EmployeeTableRow[] {
    return this.cachedTableRows;
  }

  private rebuildTableRows(): void {
    this.cachedTableRows = this.computeTableRows();
  }

  private computeTableRows(): EmployeeTableRow[] {
    const currentRange = this.currentRange;
    const previousRange = this.previousRange(currentRange);
    return this.mockData.employees
      .map((employee) => {
        const history = this.filteredAbsences.filter((absence) => absence.employeeId === employee.id);
        const absenceDays = history.reduce((sum, absence) => sum + this.daysWithinRange(absence, currentRange), 0);
        const previousDays = this.enrichedAbsences
          .filter((absence) => absence.employeeId === employee.id && this.matchesGlobalFilters(absence, previousRange))
          .reduce((sum, absence) => sum + this.daysWithinRange(absence, previousRange), 0);
        const typeByDays = new Map<AbsenceType, number>();
        history.forEach((absence) => {
          const previous = typeByDays.get(absence.type) ?? 0;
          typeByDays.set(absence.type, previous + this.daysWithinRange(absence, currentRange));
        });
        const typeBreakdown = Array.from(typeByDays.entries())
          .filter(([, days]) => days > 0)
          .map(([type, days]) => ({ type, days }))
          .sort((left, right) => right.days - left.days);
        const attCurrent = this.attendanceRows.filter(r => {
          if (r.employeeId !== employee.id) return false;
          const d = this.parseDate(r.attendanceDate);
          return d >= currentRange.start && d <= currentRange.end;
        });
        const importedCurrent = attCurrent.length;
        const presentCurrent  = attCurrent.filter(r => r.isPresent).length;
        const attPrevious = this.attendanceRows.filter(r => {
          if (r.employeeId !== employee.id) return false;
          const d = this.parseDate(r.attendanceDate);
          return d >= previousRange.start && d <= previousRange.end;
        });
        const importedPrevious = attPrevious.length;
        const presentPrevious  = attPrevious.filter(r => r.isPresent).length;
        const wdCurrent  = Math.max(1, importedCurrent > 0 ? importedCurrent : this.countWeekdays(currentRange.start, currentRange.end));
        const wdPrevious = Math.max(1, importedPrevious > 0 ? importedPrevious : this.countWeekdays(previousRange.start, previousRange.end));
        const absenteeismRate = this.toRate(absenceDays, 1, wdCurrent);
        const previousAbsenteeismRate = this.toRate(previousDays, 1, wdPrevious);
        const presenceRate = importedCurrent > 0 ? Number(((presentCurrent / importedCurrent) * 100).toFixed(1)) : 0;
        const previousPresenceRate = importedPrevious > 0 ? Number(((presentPrevious / importedPrevious) * 100).toFixed(1)) : 0;
        return {
          employeeId: employee.id,
          employeeName: employee.fullName,
          employeeAvatar: employee.avatar,
          department: employee.department,
          jobTitle: employee.jobTitle,
          absenceDays,
          typeBreakdown,
          absenteeismRate,
          previousAbsenteeismRate,
          presenceRate,
          previousPresenceRate,
          alert: importedCurrent > 0 && presenceRate < 65,
          recidive: history.filter((a) => a.type === 'maladie').length > 2,
          history
        };
      })
      .filter((row) => row.absenceDays > 0)
      .sort((left, right) => right.absenceDays - left.absenceDays);
  }

  onFiltersChanged(): void {
    this.instantPage = 1;
    this.rebuildTableRows();
  }

  // --- Tab & Leave Management -------------------------------------------------
  setTab(tab: typeof this.activeTab): void { this.activeTab = tab; }

  goToCongesSection(anchor: 'pending' | 'history'): void {
    this.activeTab = 'conges';
    if (isPlatformBrowser(this.platformId)) {
      const id = anchor === 'pending' ? 'conges-section-pending' : 'conges-section-history';
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  openLeaveRequestModal(): void { this.showLeaveRequestModal = true; }

  onLeaveRequestSubmitted(request: LeaveRequest): void {
    this.showLeaveRequestModal = false;
    this.leaveRequests = [request, ...this.leaveRequests];
    this.toastService.success('Demande de congï¿½ soumise avec succï¿½s.');
    this.loadLeaveData();
  }

  onRequestStatusChange(event: { id: number; status: LeaveStatus; reason?: string }): void {
    this.leaveRequestService.updateStatus(event.id, event.status, event.reason).subscribe({
      next: () => {
        const label = event.status === 'approved' ? 'approuvée' : event.status === 'cancelled' ? 'annulée' : 'rejetée';
        this.toastService.success(`Demande ${label}.`);
        this.loadLeaveData();
      },
      error: (err) => {
        this.toastService.error(err?.error?.message ?? 'Erreur lors de la mise ï¿½ jour.');
      }
    });
  }

  onPolicySaved(updated?: LeavePolicy): void {
    // Mettre à jour la policy dans le tableau local immédiatement
    if (updated) {
      this.leavePolicies = this.leavePolicies.map(p => p.id === updated.id ? updated : p);
    }
    // Recharger les soldes : le backend a propagé entitled vers leave_balances
    this.leaveBalanceService.getAll().pipe(catchError(() => of([] as LeaveBalance[]))).subscribe(
      (balances) => { this.leaveBalances = balances; this.cdr.detectChanges(); }
    );
  }

  private loadLeaveData(): void {
    this.leaveDataUnavailable = false;
    this.leaveRequestService.getAll().pipe(catchError((err) => {
      console.warn('[Leave] API leave-requests indisponible, fallback vide.', err?.status);
      this.leaveDataUnavailable = true;
      return of([] as LeaveRequest[]);
    })).subscribe(
      (requests) => { this.leaveRequests = requests; this.reapplyAbsenceTypes(); }
    );
    this.leaveBalanceService.getAll().pipe(catchError((err) => {
      console.warn('[Leave] API leave-balances indisponible, fallback vide.', err?.status);
      return of([] as LeaveBalance[]);
    })).subscribe(
      (balances) => { this.leaveBalances = balances; this.cdr.detectChanges(); }
    );
    this.leavePolicyService.getAll().pipe(catchError((err) => {
      console.warn('[Leave] API leave-policies indisponible, utilisation des politiques par dï¿½faut.', err?.status);
      return of(this.defaultLeavePolicies);
    })).subscribe(
      (policies) => { this.leavePolicies = policies; this.cdr.detectChanges(); }
    );
    // ongoingLeavesThisMonthKpi et pendingLeaveApprovalsKpi sont des getters calculï¿½s localement
  }

  private readonly defaultLeavePolicies: LeavePolicy[] = [
    { id: 1, type: 'conge-paye', label: 'Congé payé annuel', maxDaysPerYear: 22, requiresDocument: false, color: '#2563eb', isActive: true },
    { id: 2, type: 'maladie', label: 'Congé maladie', maxDaysPerYear: 60, requiresDocument: true, color: '#f59e0b', isActive: true },
    { id: 3, type: 'sans-solde', label: 'Congé sans solde', maxDaysPerYear: 30, requiresDocument: false, color: '#6b7280', isActive: true },
    { id: 4, type: 'evenement-familial', label: 'Événement familial', maxDaysPerYear: 10, requiresDocument: true, color: '#8b5cf6', isActive: true },
    { id: 5, type: 'autre', label: 'Autre absence', maxDaysPerYear: 15, requiresDocument: false, color: '#9ca3af', isActive: true }
  ];

  setInstantTab(tab: InstantViewTab): void {
    this.instantTab = tab;
    this.instantPage = 1;
  }

  previousInstantPage(): void {
    this.instantPage = Math.max(1, this.instantPage - 1);
  }

  nextInstantPage(): void {
    this.instantPage = Math.min(this.instantTotalPages, this.instantPage + 1);
  }

  toggleTypeFromLegend(type: AbsenceType): void {
    this.selectedAbsenceType = this.selectedAbsenceType === type ? '' : type;
    this.onFiltersChanged();
  }

  toggleDepartmentFromLegend(department: string): void {
    this.selectedDepartment = this.selectedDepartment === department ? '' : department;
    this.onFiltersChanged();
  }

  resetFilters(): void {
    this.selectedPeriod = 'month';
    this.selectedDepartment = '';
    this.selectedAbsenceType = '';
    this.selectedEmployee = '';
    this.instantPage = 1;
    this.customStartDate = '';
    this.customEndDate = '';
    this.rebuildTableRows();
  }

  exportExcel(): void {
    const rows = this.periodFilteredRows.filter(r => this.matchesAttendanceFilters(r));
    if (!rows.length) { this.toastService.error('Aucune donnée à exporter.'); return; }
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const header = ['employee_id', 'nom', 'date', 'present', 'retard', 'heures_supp', 'departement'];
      const data = rows.map(r => {
        const name = this.getEmployeeName(r.employeeId);
        const dept = this.mockData.employees.find(e => e.id === r.employeeId)?.department ?? '';
        return [r.employeeId, name, r.attendanceDate ?? '', r.isPresent ? 'Oui' : 'Non', r.isLate ? 'Oui' : 'Non', r.overtimeHours ?? 0, dept];
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Absences');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `absences_${today}.xlsx`);
    });
  }
    getKpiThreshold(kpiKey: string) {
    return this.kpiThresholdService.getThreshold(kpiKey);
  }

  getKpiCurrentValue(kpiKey: string): number {
    switch (kpiKey) {
      case 'absenteisme': return this.absenteeismRateKpi;
      case 'retard':      return this.lateRateKpi;
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

  openThresholdModal(kpiKey: string, kpiLabel: string, event: Event): void {
    if (!isKpiKey(kpiKey)) return;
    event.stopPropagation();
    this.thresholdModalKpiKey = kpiKey;
    this.thresholdModalKpiLabel = kpiLabel;
    this.thresholdModalOpen = true;
  }

  closeThresholdModal(): void {
    this.thresholdModalOpen = false;
  }

  onThresholdSaved(): void {
    this.checkAllThresholds();
    this.cdr.markForCheck();
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
      this.cdr.markForCheck();
    });
  }

  private isKpiDataReady(): boolean {
    return !this.isLoading && this.kpiRows.length > 0;
  }

  previousMonth(): void {
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() - 1, 1);
  }

  nextMonth(): void {
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() + 1, 1);
  }

  onNotifications(): void {}

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil(): void {
    this.router.navigate(['/profil']);
  }

  openImportModal(): void {
    this.showImportModal = true;
    this.importFileError = '';
    this.selectedImportFile = null;
  }

  closeImportModal(): void {
    if (this.importInProgress) {
      this.cancelOngoingImport();
    }
    this.showImportModal = false;
    this.importFileError = '';
    this.selectedImportFile = null;
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedImportFile = file;
    this.importFileError = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.importFileError = 'Seuls les fichiers .xlsx sont acceptï¿½s.';
      this.selectedImportFile = null;
      input.value = '';
    }
  }

  downloadAttendanceTemplate(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['employee_id', 'date', 'is_present', 'is_late', 'overtime_hours'];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Pointage');
      XLSX.writeFile(wb, 'template-pointage.xlsx');
    }).catch(() => {
      this.toastService.error('Impossible de gï¿½nï¿½rer le modï¿½le. Rechargez la page.');
    });
  }

  submitAttendanceImport(): void {
    if (!this.selectedImportFile) {
      this.importFileError = 'Veuillez sï¿½lectionner un fichier Excel (.xlsx).';
      this.toastService.error(this.importFileError);
      return;
    }
    const fileToImport = this.selectedImportFile;
    this.importInProgress = true;
    this.importFileError = '';
    this.startImportWatchdog();
    this.importRequestSub?.unsubscribe();
    this.importRequestSub = this.attendanceService.importExcel(fileToImport).pipe(
      finalize(() => {
        this.zone.run(() => {
          this.clearImportWatchdog();
          this.importRequestSub = null;
          this.importInProgress = false;
          this.cdr.detectChanges();
        });
      })
    ).subscribe({
      next: (result) => {
        this.zone.run(() => {
          this.showImportModal = false;
          this.selectedImportFile = null;
          this.importFileError = '';
          this.toastService.success(
            `${result.affectedEmployees} employ\u00e9(s) import\u00e9(s) (${result.importedRows} lignes).`
          );
          if (result.skippedEmployeeIds && result.skippedEmployeeIds.length > 0) {
            this.toastService.warning(
              `${result.skippedEmployeeIds.length} employee_id ignor\u00e9(s) : ${result.skippedEmployeeIds.join(', ')}`
            );
          }
          this.loadAttendanceRows();
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          const message = error?.name === 'TimeoutError'
            ? "L'import prend trop de temps. V\u00e9rifiez le format du fichier et r\u00e9essayez."
            : error?.error?.message
              ?? error?.error
              ?? error?.message
              ?? 'Import Excel impossible.';
          this.importFileError = message;
          this.toastService.error(message);
          this.cdr.detectChanges();
        });
      }
    });
  }

  private cancelOngoingImport(): void {
    this.importRequestSub?.unsubscribe();
    this.importRequestSub = null;
    this.clearImportWatchdog();
    this.importInProgress = false;
  }

  private startImportWatchdog(): void {
    this.clearImportWatchdog();
    this.importWatchdogId = setTimeout(() => {
      if (!this.importInProgress) {
        return;
      }
      this.importInProgress = false;
      this.importFileError = "Import bloquï¿½: aucune rï¿½ponse du serveur. Vï¿½rifiez le backend puis rï¿½essayez.";
      this.toastService.error(this.importFileError);
    }, 20000);
  }

  private clearImportWatchdog(): void {
    if (this.importWatchdogId !== null) {
      clearTimeout(this.importWatchdogId);
      this.importWatchdogId = null;
    }
  }

  get displayRows(): Attendance[] {
    return this.attendanceRows;
  }

  get periodFilteredRows(): Attendance[] {
    const range = this.currentRange;
    return this.displayRows.filter(row => {
      if (!row.attendanceDate) return true;
      const d = this.parseDate(row.attendanceDate);
      return d >= range.start && d <= range.end;
    });
  }

  private loadAbsenceData(): void {
    this.isLoading = true;
    forkJoin({
      employees: this.employeeService.getAllEmployees().pipe(catchError(() => of([] as Employee[]))),
      attendance: this.attendanceService.getAllHr().pipe(catchError(() => of([] as Attendance[])))
    }).subscribe({
      next: ({ employees, attendance }) => this.applyAttendanceData(employees ?? [], attendance ?? []),
      error: () => this.applyAttendanceData([], [])
    });
  }

  private loadAttendanceRows(): void {
    this.attendanceLoading = true;
    this.attendanceError = '';
    this.attendanceService.getAllHr().subscribe({
      next: (rows) => {
        this.attendanceRows = (rows ?? [])
          .filter((row) => row.employeeId > 0)
          .sort((left, right) => left.employeeId - right.employeeId);
        this.attendanceByEmployee = new Map(this.attendanceRows.map((row) => [row.employeeId, row]));
        this.attendanceLoading = false;
        this.loadAbsenceData();
      },
      error: (error) => {
        this.attendanceRows = [];
        this.attendanceByEmployee = new Map<number, Attendance>();
        this.attendanceLoading = false;
        this.attendanceError = error?.error?.message ?? 'Impossible de charger les donnï¿½es de prï¿½sence.';
        this.loadAbsenceData();
      }
    });
  }

  private applyAttendanceData(employees: Employee[], attendanceRows: Attendance[]): void {
    const palette = ['#2563eb', '#0ea5e9', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1', '#16a34a'];
    const groupedByDepartment = new Map<string, number>();
    const departmentColor = new Map<string, string>();

    const employeeProfiles = employees.map((employee) => {
      const fullName = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
      const initials = `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`.toUpperCase() || '--';
      const department = employee.departmentName || 'N/A';
      groupedByDepartment.set(department, (groupedByDepartment.get(department) ?? 0) + 1);
      if (!departmentColor.has(department)) {
        const color = palette[departmentColor.size % palette.length];
        departmentColor.set(department, color);
      }
      return {
        id: employee.employeeId,
        fullName: fullName || `Employï¿½ #${employee.employeeId}`,
        avatar: initials,
        department,
        jobTitle: employee.jobTitle || 'N/A'
      };
    });

    const dynamicDepartments = Array.from(groupedByDepartment.entries()).map(([name, headcount]) => ({
      name,
      headcount,
      color: departmentColor.get(name) ?? '#2563eb'
    }));

    const departmentEntries = dynamicDepartments.slice().sort((a, b) => a.name.localeCompare(b.name));

    this.attendanceRows = (attendanceRows ?? []).slice().sort((left, right) => left.employeeId - right.employeeId);
    this.attendanceByEmployee = new Map(this.attendanceRows.map((row) => [row.employeeId, row]));

    this.mockData.departments = departmentEntries;
    this.mockData.employees = employeeProfiles;
    this.mockData.absences = [];
    this.departmentColors = Object.fromEntries(departmentEntries.map((item) => [item.name, item.color]));
    this.enrichedAbsences = this.buildEnrichedAbsences();
    this.rebuildTableRows();
    this.isLoading = false;
    this.checkAllThresholds();

  }



  /**
   * Rï¿½-applique la rï¿½conciliation type absence/congï¿½ sur les lignes dï¿½jï¿½ chargï¿½es.
   * Appelï¿½ aprï¿½s que leaveRequests soit mis ï¿½ jour, pour que les types reflï¿½tent
   * les congï¿½s approuvï¿½s mï¿½me si la rï¿½ponse API congï¿½s arrive aprï¿½s l'attendance.
   */
  private reapplyAbsenceTypes(): void {
    if (this.attendanceRows.length === 0) return;
    this.enrichedAbsences = this.buildEnrichedAbsences();
    this.rebuildTableRows();
    this.cdr.detectChanges();
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
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), q * 3, 1),
        end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999)
      };
    }
    // 'month' (default)
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    };
  }

  private rangeForPreset(period: Exclude<PeriodPreset, 'custom' | 'all'>): DateRange {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') {
      return { start: todayStart, end: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(), 23, 59, 59, 999) };
    }
    if (period === 'week') {
      const start = new Date(todayStart);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999) };
    }
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    };
  }

  private rangeForTab(tab: InstantViewTab): DateRange {
    if (tab === 'today') return this.rangeForPreset('today');
    if (tab === 'week') return this.rangeForPreset('week');
    return this.rangeForPreset('month');
  }

  private previousRange(range: DateRange): DateRange {
    if (this.selectedPeriod === 'month') {
      const start = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (this.selectedPeriod === 'quarter') {
      const start = new Date(range.start.getFullYear(), range.start.getMonth() - 3, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    if (this.selectedPeriod === 'year') {
      return {
        start: new Date(range.start.getFullYear() - 1, 0, 1),
        end: new Date(range.start.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
      };
    }
    return { start: range.start, end: range.end };
  }

  private buildEnrichedAbsences(): EnrichedAbsence[] {
    const employeeById = new Map(this.mockData.employees.map(emp => [emp.id, emp]));
    const absences: EnrichedAbsence[] = [];
    let idCounter = 1;

    const byEmployee = new Map<number, Attendance[]>();
    for (const row of this.attendanceRows) {
      if (!row.attendanceDate) continue;
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push(row);
      byEmployee.set(row.employeeId, list);
    }

    for (const [employeeId, days] of byEmployee) {
      const employee = employeeById.get(employeeId);
      days.sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate));

      let episodeStart: string | null = null;
      let episodeEnd:   string | null = null;
      let episodeDays = 0;

      const getType = (startDate: string, endDate: string): AbsenceType => {
        const match = this.leaveRequests.find(lr =>
          lr.employeeId === employeeId &&
          lr.status === 'approved' &&
          this.periodsOverlap(lr.startDate, lr.endDate, startDate, endDate));
        return match ? match.type : 'autre';
      };

      const pushEpisode = () => {
        if (episodeStart && episodeEnd && episodeDays > 0) {
          absences.push({
            id: idCounter++,
            employeeId,
            employeeName: employee?.fullName ?? `EmployÃ© #${employeeId}`,
            employeeAvatar: employee?.avatar ?? '--',
            department: employee?.department ?? 'N/A',
            jobTitle: employee?.jobTitle ?? 'N/A',
            type: getType(episodeStart, episodeEnd),
            startDate: episodeStart,
            endDate: episodeEnd,
            reason: `${episodeDays} j d'absence`,
            totalDays: episodeDays,
          });
        }
      };

      for (const day of days) {
        if (!day.isPresent) {
          if (episodeStart === null) {
            episodeStart = day.attendanceDate;
            episodeEnd   = day.attendanceDate;
            episodeDays  = 1;
          } else {
            episodeEnd = day.attendanceDate;
            episodeDays++;
          }
        } else {
          pushEpisode();
          episodeStart = null;
          episodeEnd   = null;
          episodeDays  = 0;
        }
      }
      pushEpisode();
    }
    return absences;
  }

  /** Returns true if the two ISO date intervals overlap. */
  private periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart <= bEnd && aEnd >= bStart;
  }

  private get kpiRows(): Attendance[] {
    return this.periodFilteredRows.filter((row) => this.matchesAttendanceFilters(row));
  }

  /** Lignes d'attendance du mois courant (M), filtrï¿½es par dï¿½partement/employï¿½. */
  private get currentMonthAttendanceRows(): Attendance[] {
    const now    = new Date();
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return this.displayRows
      .filter(r => this.matchesAttendanceFilters(r))
      .filter(r => {
        if (!r.attendanceDate) return false;
        const d = this.parseDate(r.attendanceDate);
        return d >= mStart && d <= mEnd;
      });
  }

  /** Lignes d'attendance du mois prï¿½cï¿½dent (M-1), filtrï¿½es par dï¿½partement/employï¿½. */
  private get previousMonthAttendanceRows(): Attendance[] {
    const now     = new Date();
    const pmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pmEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return this.displayRows
      .filter(r => this.matchesAttendanceFilters(r))
      .filter(r => {
        if (!r.attendanceDate) return false;
        const d = this.parseDate(r.attendanceDate);
        return d >= pmStart && d <= pmEnd;
      });
  }

  /** Toutes les periodStart distinctes de tous les imports, indï¿½pendamment du filtre pï¿½riode. */
  private get sortedPeriodKeysAll(): string[] {
    const keys = new Set<string>();
    this.displayRows.filter(r => this.matchesAttendanceFilters(r)).forEach(row => {
      if (row.attendanceDate) { keys.add(row.attendanceDate.slice(0, 7)); }
    });
    return Array.from(keys).sort();
  }

  private matchesAttendanceFilters(row: Attendance): boolean {
    const employee = this.mockData.employees.find((item) => item.id === row.employeeId);
    const departmentMatch = this.selectedDepartment ? employee?.department === this.selectedDepartment : true;
    return departmentMatch;
  }

  private get sortedPeriodKeys(): string[] {
    const keys = new Set<string>();
    this.kpiRows.forEach(row => { if (row.attendanceDate) { keys.add(row.attendanceDate.slice(0, 7)); } });
    return Array.from(keys).sort();
  }

  private rowsForPeriodKey(yearMonth: string): Attendance[] {
    return this.kpiRows.filter(r => r.attendanceDate?.slice(0, 7) === yearMonth);
  }

  private avgAbsenteeismForRows(rows: Attendance[]): number {
    if (!rows.length) return 0;
    const absentCount = rows.filter(r => !r.isPresent).length;
    return Number(((absentCount / rows.length) * 100).toFixed(1));
  }

  private avgLateRateForRows(rows: Attendance[]): number {
    if (!rows.length) return 0;
    const lateCount = rows.filter(r => r.isLate).length;
    return Number(((lateCount / rows.length) * 100).toFixed(1));
  }

  private matchesGlobalFilters(absence: EnrichedAbsence, range: DateRange, skipPeriod = false): boolean {
    const departmentMatch = this.selectedDepartment ? absence.department === this.selectedDepartment : true;
    const typeMatch = this.selectedAbsenceType ? absence.type === this.selectedAbsenceType : true;
    const rangeMatch = skipPeriod || this.overlaps(absence, range);
    return departmentMatch && typeMatch && rangeMatch;
  }

  private overlaps(absence: EnrichedAbsence, range: DateRange): boolean {
    const start = this.parseDate(absence.startDate);
    const end = this.parseDate(absence.endDate);
    return start <= range.end && end >= range.start;
  }

  private parseDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map((value) => Number(value));
    return new Date(year, month - 1, day);
  }

  private isInRange(day: Date, start: Date, end: Date): boolean {
    return day >= start && day <= end;
  }

  private daysWithinRange(absence: EnrichedAbsence, range: DateRange): number {
    const start = this.parseDate(absence.startDate);
    const end   = this.parseDate(absence.endDate);
    const from  = start > range.start ? start : range.start;
    const to    = end   < range.end   ? end   : range.end;
    if (from > to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  }

  /** Retourne le nom complet de l'employï¿½ depuis mockData, ou l'ID en fallback. */
  getEmployeeName(employeeId: number): string {
    return this.mockData.employees.find(e => e.id === employeeId)?.fullName ?? `#${employeeId}`;
  }

  private remainingLabel(absence: EnrichedAbsence): string {
    if (typeof absence.leaveDaysRemaining === 'number') {
      return `${Math.max(0, absence.leaveDaysRemaining)} j de solde`;
    }
    return `${absence.totalDays} j d'absence`;
  }

  private toYmd(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private countWeekdays(start: Date, end: Date): number {
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const d = cursor.getDay();
      if (d !== 0 && d !== 6) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  private departmentsInTension(absences: EnrichedAbsence[]): string[] {
    const byDepartment = new Map<string, number>();
    absences.forEach((absence) => {
      byDepartment.set(absence.department, (byDepartment.get(absence.department) ?? 0) + 1);
    });
    return Array.from(byDepartment.entries())
      .filter(([department, count]) => {
        const headcount = this.mockData.departments.find((item) => item.name === department)?.headcount ?? 1;
        return count / headcount > 0.3;
      })
      .map(([department]) => department);
  }

  private absenceDaysByDepartment(department: string, range: DateRange): number {
    return this.enrichedAbsences
      .filter((absence) => absence.department === department && this.matchesGlobalFilters(absence, range))
      .reduce((sum, absence) => sum + this.daysWithinRange(absence, range), 0);
  }

  private rangeDays(range: DateRange): number {
    return Math.max(1, Math.floor((range.end.getTime() - range.start.getTime()) / 86400000) + 1);
  }

  private toRate(absenceDays: number, population: number, daysInPeriod: number): number {
    return Number(((absenceDays / (population * daysInPeriod)) * 100).toFixed(1));
  }

  private rateForRange(range: DateRange): number {
    const days = this.filteredAbsences.reduce((sum, absence) => sum + this.daysWithinRange(absence, range), 0);
    const headcount = this.mockData.departments.reduce((sum, item) => sum + item.headcount, 0);
    return this.toRate(days, headcount, this.rangeDays(range));
  }
}
