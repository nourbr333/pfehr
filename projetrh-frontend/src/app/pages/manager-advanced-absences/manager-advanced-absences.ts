import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Chart from 'chart.js/auto';
import { AuthService, Utilisateur } from '../../services/auth';
import { ManagerService } from '../../services/manager.service';
import {
  AdvancedAbsenceDashboard,
  AdvancedAbsenceType,
  AdvancedAbsenceViewMode,
  CalendarAbsenceItem,
  ContinuityPlanResult,
  ManagerAdvancedAbsencesService,
  PipelineRequestItem,
  SuggestedAlternativesResponse
} from '../../services/manager-advanced-absences.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

@Component({
  selector: 'app-manager-advanced-absences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './manager-advanced-absences.html',
  styleUrl: './manager-advanced-absences.scss'
})
export class ManagerAdvancedAbsencesComponent implements OnInit, AfterViewInit {
  utilisateur: Utilisateur | null;
  managerEmployeeId: number | null = null;

  viewMode: AdvancedAbsenceViewMode = 'monthly';
  referenceDate = new Date().toISOString().slice(0, 10);
  displayMonth = new Date();
  readonly tensionThreshold = 2;
  selectedCalendarType: AdvancedAbsenceType | '' = '';
  readonly weekLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  readonly calendarTypes: AdvancedAbsenceType[] = ['conge-paye', 'maladie', 'sans-solde', 'evenement-familial', 'autre'];
  readonly typeMeta: Record<AdvancedAbsenceType, { label: string; bg: string; text: string }> = {
    'conge-paye':        { label: 'Congé payé',         bg: '#dcfce7', text: '#166534' },
    'maladie':           { label: 'Maladie',             bg: '#ffedd5', text: '#9a3412' },
    'sans-solde':        { label: 'Sans solde',          bg: '#fef9c3', text: '#854d0e' },
    'evenement-familial':{ label: 'Événement familial',  bg: '#f3e8ff', text: '#7e22ce' },
    'autre':             { label: 'Autre',               bg: '#f1f5f9', text: '#475569' }
  };

  readonly dotColors: Record<AdvancedAbsenceType, string> = {
    'conge-paye':         '#16a34a',
    'maladie':            '#ea580c',
    'sans-solde':         '#ca8a04',
    'evenement-familial': '#9333ea',
    'autre':              '#64748b',
  };

  activeTab = 'vue';
  activeActionPanel = 'alt';
  instantFilter: 'today' | 'week' | 'month' = 'today';

  isLoading = false;
  actionLoading = false;
  loadError = '';
  actionMessage = '';

  dashboard: AdvancedAbsenceDashboard | null = null;
  alternatives: SuggestedAlternativesResponse | null = null;

  selectedRequestIdForAlternatives: number | null = null;
  selectedRequestIdForPlan: number | null = null;
  selectedBackupEmployeeId: number | null = null;
  backupSearchQuery = '';
  backupDropdownOpen = false;
  continuityNotes = '';

  continuityPlans: ContinuityPlanResult[] = [];
  continuityPlansLoading = false;
  backupConflictWarning = '';
  pipelineSortKey: 'startDate' | 'requestedAt' = 'startDate';
  approvedSortDir: 'asc' | 'desc' = 'asc';

  highlightedRequestId: number | null = null;

  @ViewChild('barCanvas') barCanvasRef?: ElementRef<HTMLCanvasElement>;
  private barChart: Chart | null = null;
  monthlyTrendData: number[] = [];
  monthlyTrendLabels: string[] = [];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private managerService: ManagerService,
    private advancedAbsenceService: ManagerAdvancedAbsencesService,
    private cdr: ChangeDetectorRef
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit(): void {
    this.managerEmployeeId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (this.managerEmployeeId == null) {
      this.loadError = 'manager non identifié';
      return;
    }
    this.loadDashboard();
    // Deep-link: open correct tab and highlight the targeted request
    this.route.queryParams.subscribe(params => {
      if (params['tab']) this.activeTab = params['tab'];
      if (params['requestId']) this.highlightedRequestId = +params['requestId'];
      if (params['actionPanel'] === 'plan' || params['actionPanel'] === 'alt') {
        this.activeActionPanel = params['actionPanel'];
        if (params['requestId']) {
          const requestId = +params['requestId'];
          if (params['actionPanel'] === 'plan') {
            this.selectedRequestIdForPlan = requestId;
          } else {
            this.selectedRequestIdForAlternatives = requestId;
          }
        }
      }
    });
  }

  ngAfterViewInit(): void {
    this.initOrUpdateBarChart();
  }

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  get calendarItems() {
    return this.dashboard?.calendarAbsences ?? [];
  }

  get monthLabel(): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(this.displayMonth);
  }

  get filteredCalendarItems(): CalendarAbsenceItem[] {
    if (!this.selectedCalendarType) return this.calendarItems;
    return this.calendarItems.filter((item) => item.absenceType === this.selectedCalendarType);
  }

  get calendarDays(): Array<{
    date: Date;
    inCurrentMonth: boolean;
    absences: CalendarAbsenceItem[];
    isTension: boolean;
    isWeekend: boolean;
  }> {
    const currentMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth(), 1);
    const monthStart = new Date(currentMonth);
    monthStart.setDate(1);
    const shift = (monthStart.getDay() + 6) % 7;
    monthStart.setDate(monthStart.getDate() - shift);

    const days: Array<{ date: Date; inCurrentMonth: boolean; absences: CalendarAbsenceItem[]; isTension: boolean; isWeekend: boolean }> = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(monthStart);
      day.setDate(monthStart.getDate() + index);
      const dayOfWeek = day.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const absences = isWeekend
        ? []
        : this.filteredCalendarItems.filter((item) =>
            this.isInRange(day, this.parseDate(item.startDate), this.parseDate(item.endDate))
          );
      days.push({
        date: day,
        inCurrentMonth: day.getMonth() === this.displayMonth.getMonth(),
        absences,
        isTension: !isWeekend && absences.length >= this.tensionThreshold,
        isWeekend
      });
    }
    return days;
  }

  get coverageAlerts() {
    return this.dashboard?.coverageAlerts ?? [];
  }

  /** Deduplicated coverage alerts grouped by alertType+title — one card per alert type with all affected days listed. */
  get groupedCoverageAlerts(): { alertType: string; severity: string; title: string; description: string; days: string[] }[] {
    const raw = this.dashboard?.coverageAlerts ?? [];
    const map = new Map<string, { alertType: string; severity: string; title: string; description: string; days: string[] }>();
    for (const a of raw) {
      const key = `${a.alertType}__${a.title}`;
      if (!map.has(key)) {
        map.set(key, { alertType: a.alertType, severity: a.severity, title: a.title, description: a.description, days: [] });
      }
      if (a.day) map.get(key)!.days.push(a.day);
    }
    return Array.from(map.values());
  }

  get projectImpacts() {
    return this.dashboard?.projectImpacts ?? [];
  }

  get pipelineRequests() {
    return this.dashboard?.pipeline.requests ?? [];
  }

  get todayAbsentCount(): number {
    const ref = this.parseDate(this.referenceDate);
    return new Set(
      this.calendarItems
        .filter((item) => item.status === 'approuvee' && this.isInRange(ref, this.parseDate(item.startDate), this.parseDate(item.endDate)))
        .map((item) => item.employeeId)
    ).size;
  }

  get absenceRatePercent(): number {
    return this.dashboard?.attendanceAbsenceRate ?? 0;
  }

  get instantAbsences(): CalendarAbsenceItem[] {
    const ref = this.parseDate(this.referenceDate);
    let filtered: CalendarAbsenceItem[];
    if (this.instantFilter === 'today') {
      filtered = this.calendarItems.filter(
        (item) => item.status === 'approuvee' && this.isInRange(ref, this.parseDate(item.startDate), this.parseDate(item.endDate))
      );
    } else if (this.instantFilter === 'week') {
      const day = ref.getDay();
      const shift = (day === 0 ? 6 : day - 1);
      const monday = new Date(ref); monday.setDate(ref.getDate() - shift);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      filtered = this.calendarItems.filter((item) => {
        const s = this.parseDate(item.startDate), e = this.parseDate(item.endDate);
        return item.status === 'approuvee' && s <= sunday && e >= monday;
      });
    } else {
      const first = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth(), 1);
      const last = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() + 1, 0);
      filtered = this.calendarItems.filter((item) => {
        const s = this.parseDate(item.startDate), e = this.parseDate(item.endDate);
        return item.status === 'approuvee' && s <= last && e >= first;
      });
    }
    const seen = new Set<number>();
    return filtered.filter((item) => {
      if (seen.has(item.employeeId)) return false;
      seen.add(item.employeeId);
      return true;
    });
  }

  get pendingRequests(): PipelineRequestItem[] {
    return this.pipelineRequests.filter((request) => request.status === 'en_attente');
  }

  get approvedRequests(): PipelineRequestItem[] {
    const today = this.parseDate(this.referenceDate);
    return this.pipelineRequests.filter(
      (request) => request.status === 'approuvee' && this.parseDate(request.endDate) >= today
    );
  }

  get cumulativeAbsenceDays(): number {
    return this.dashboard?.cumulativeAbsenceDays ?? 0;
  }

  get prevMonthLabel(): string {
    const d = new Date();
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(prev);
  }

  get currentMonthLabel(): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date());
  }

  get teamAvailability(): { available: number; total: number; pct: number; color: 'green' | 'orange' | 'red' } {
    const total = this.dashboard?.totalTeamMembers ?? 0;
    const absent = this.todayAbsentCount;
    const available = Math.max(0, total - absent);
    const pct = total > 0 ? (available / total) * 100 : 100;
    const color: 'green' | 'orange' | 'red' = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red';
    return { available, total, pct, color };
  }

  get absenceRateTrend(): 'up' | 'down' | 'flat' {
    if (!this.dashboard) return 'flat';
    const curr = this.absenceRatePercent;
    const prev = this.dashboard.prevAttendanceAbsenceRate ?? curr;
    if (curr - prev > 1) return 'up';
    if (prev - curr > 1) return 'down';
    return 'flat';
  }

  get availabilityColor(): string {
    const pct = this.teamAvailability.pct;
    if (pct >= 70) return '#16a34a';
    if (pct >= 50) return '#d97706';
    return '#dc2626';
  }

  get absenceRateColor(): string {
    if (this.absenceRatePercent > 25) return '#dc2626';
    if (this.absenceRatePercent > 15) return '#d97706';
    return '#16a34a';
  }

  get absenceRateDeltaPts(): number {
    return this.absenceRatePercent - (this.dashboard?.prevMonthAbsenceRate ?? this.absenceRatePercent);
  }

  get backupCountForPeriod(): number {
    const seen = new Set<number>();
    return this.calendarItems.filter((item) => {
      if (item.status !== 'approuvee' || seen.has(item.employeeId)) return false;
      seen.add(item.employeeId);
      return item.backupAssigned;
    }).length;
  }

  get sparklineBars(): Array<{ height: number; isCurrent: boolean; x: number }> {
    const vals = this.monthlyTrendData.length ? this.monthlyTrendData.slice(-7) : Array(7).fill(0) as number[];
    const maxVal = Math.max(...vals, 1);
    return vals.map((v, i) => ({
      height: Math.max(v > 0 ? 3 : 0, Math.round((v / maxVal) * 26)),
      isCurrent: i === vals.length - 1,
      x: i * 12,
    }));
  }

  get typeDistributionByDays(): Array<{ type: AdvancedAbsenceType; label: string; days: number; pct: number; barColor: string }> {
    const barColors: Record<AdvancedAbsenceType, string> = {
      'conge-paye': '#1bb855',
      'maladie': '#f97316',
      'sans-solde': '#eab308',
      'evenement-familial': '#a855f7',
      'autre': '#94a3b8',
    };
    const approved = this.calendarItems.filter((i) => i.status === 'approuvee');
    if (!approved.length) return [];
    const daysByType = new Map<AdvancedAbsenceType, number>();
    for (const item of approved) {
      const d = this.calcDays(item.startDate, item.endDate);
      daysByType.set(item.absenceType, (daysByType.get(item.absenceType) ?? 0) + d);
    }
    const totalDays = Array.from(daysByType.values()).reduce((s, v) => s + v, 0);
    return this.calendarTypes.map((t) => ({
      type: t,
      label: this.typeMeta[t].label,
      days: daysByType.get(t) ?? 0,
      pct: totalDays > 0 ? ((daysByType.get(t) ?? 0) / totalDays) * 100 : 0,
      barColor: barColors[t],
    }));
  }

  get totalDaysCurrentPeriod(): number {
    return this.typeDistributionByDays.reduce((s, d) => s + d.days, 0);
  }

  get typeDistribution(): Array<{ type: AdvancedAbsenceType; label: string; count: number; pct: number; bg: string; text: string }> {
    const approved = this.calendarItems.filter((i) => i.status === 'approuvee');
    if (!approved.length) return [];
    const counts = new Map<AdvancedAbsenceType, number>();
    for (const item of approved) {
      counts.set(item.absenceType, (counts.get(item.absenceType) ?? 0) + 1);
    }
    const total = approved.length;
    return this.calendarTypes
      .filter((t) => (counts.get(t) ?? 0) > 0)
      .map((t) => ({
        type: t,
        label: this.typeMeta[t].label,
        count: counts.get(t)!,
        pct: (counts.get(t)! / total) * 100,
        bg: this.typeMeta[t].bg,
        text: this.typeMeta[t].text,
      }));
  }

  get instantAbsencesSorted(): CalendarAbsenceItem[] {
    return [...this.instantAbsences].sort((a, b) => a.endDate.localeCompare(b.endDate));
  }

  get sortedPendingRequests(): PipelineRequestItem[] {
    return [...this.pendingRequests].sort((a, b) =>
      this.pipelineSortKey === 'startDate'
        ? a.startDate.localeCompare(b.startDate)
        : a.requestedAt.localeCompare(b.requestedAt)
    );
  }

  get sortedApprovedRequests(): PipelineRequestItem[] {
    const sorted = [...this.approvedRequests].sort((a, b) =>
      this.pipelineSortKey === 'startDate'
        ? a.startDate.localeCompare(b.startDate)
        : a.requestedAt.localeCompare(b.requestedAt)
    );
    return this.approvedSortDir === 'desc' ? sorted.reverse() : sorted;
  }

  loadDashboard(): void {
    if (!this.managerEmployeeId) return;
    this.isLoading = true;
    this.loadError = '';
    this.actionMessage = '';
    this.advancedAbsenceService
      .getDashboard(this.managerEmployeeId, this.viewMode, this.referenceDate, this.tensionThreshold)
      .subscribe({
        next: (dashboard) => {
          this.dashboard = dashboard;
          this.syncDisplayMonth();
          this.isLoading = false;
          this.ensureSelections();
          this.cdr.detectChanges();
          this.loadContinuityPlans();
          this.loadMonthlyTrend();
        },
        error: () => {
          this.dashboard = null;
          this.isLoading = false;
          this.loadError = 'impossible de charger les absences avancées';
        }
      });
  }

  suggestAlternatives(): void {
    if (!this.managerEmployeeId || !this.selectedRequestIdForAlternatives) return;
    this.actionLoading = true;
    this.actionMessage = '';
    this.advancedAbsenceService
      .suggestAlternatives(this.managerEmployeeId, {
        requestId: this.selectedRequestIdForAlternatives,
        searchWindowDays: 60,
        maxAlternatives: 5
      })
      .subscribe({
        next: (response) => {
          this.alternatives = response;
          this.actionLoading = false;
          this.actionMessage = response.alternatives.length
            ? 'alternatives générées'
            : 'aucune alternative sans conflit trouvée';
        },
        error: () => {
          this.actionLoading = false;
          this.actionMessage = 'échec de génération des alternatives';
        }
      });
  }

  createContinuityPlan(): void {
    if (!this.managerEmployeeId || !this.selectedRequestIdForPlan) return;
    this.actionLoading = true;
    this.actionMessage = '';
    this.advancedAbsenceService
      .createContinuityPlan(this.managerEmployeeId, {
        requestId: this.selectedRequestIdForPlan,
        backupEmployeeId: this.selectedBackupEmployeeId ?? undefined,
        notes: this.continuityNotes.trim() || undefined
      })
      .subscribe({
        next: () => {
          this.actionLoading = false;
          this.actionMessage = 'plan de continuité créé';
          this.continuityNotes = '';
          this.backupConflictWarning = '';
          this.loadDashboard();
        },
        error: () => {
          this.actionLoading = false;
          this.actionMessage = 'création du plan de continuité impossible';
        }
      });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  setActionPanel(panel: string): void {
    this.activeActionPanel = panel;
  }

  setInstantFilter(filter: 'today' | 'week' | 'month'): void {
    this.instantFilter = filter;
  }

  setAltForRequest(requestId: number): void {
    this.selectedRequestIdForAlternatives = requestId;
    this.activeTab = 'actions';
    this.activeActionPanel = 'alt';
  }

  setPlanForRequest(requestId: number): void {
    this.selectedRequestIdForPlan = requestId;
    this.selectedBackupEmployeeId = null;
    this.backupSearchQuery = '';
    this.backupDropdownOpen = false;
    this.backupConflictWarning = '';
    this.activeTab = 'actions';
    this.activeActionPanel = 'plan';
  }

  isProjectImpactUntreated(impact: { backupAssigned?: boolean }): boolean {
    return !impact.backupAssigned;
  }

  isProjectImpactAtRisk(impact: { riskStatus?: string; capacityRiskPercent?: number }): boolean {
    const risk = (impact.riskStatus ?? '').toUpperCase();
    if (risk === 'OFF_TRACK' || risk === 'AT_RISK') return true;
    return (impact.capacityRiskPercent ?? 0) > 0;
  }

  onProjectImpactClick(impact: { objectiveId: number; backupAssigned?: boolean }): void {
    if (!this.isProjectImpactUntreated(impact)) return;
    this.router.navigate(['/manager/okr'], {
      queryParams: { tab: 'analyse', objectiveId: impact.objectiveId }
    });
  }

  getInitials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');
  }

  calcDays(startDate: string, endDate: string): number {
    const s = this.parseDate(startDate);
    const e = this.parseDate(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
  }

  fmtDate(date: string | null | undefined): string {
    if (!date) return '';
    const [y, m, d] = date.slice(0, 10).split('-');
    if (!y || !m || !d) return date;
    return `${d}/${m}/${y}`;
  }

  absenceTypeLabel(type: AdvancedAbsenceType): string {
    return this.typeMeta[type]?.label ?? type;
  }

  toggleCalendarType(type: AdvancedAbsenceType): void {
    this.selectedCalendarType = this.selectedCalendarType === type ? '' : type;
  }

  previousMonth(): void {
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() - 1, 1);
  }

  nextMonth(): void {
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() + 1, 1);
  }

  statusLabel(status: string): string {
    if (status === 'approuvee') return 'approuvée';
    if (status === 'refusee') return 'refusée';
    return 'en attente';
  }

  statusClass(status: string): string {
    if (status === 'approuvee') return 'pill approved';
    if (status === 'refusee') return 'pill refused';
    return 'pill pending';
  }

  planStatusLabel(status: string): string {
    if (status === 'created') return 'Créé';
    return status;
  }

  riskLabel(riskStatus: string): string {
    const normalized = (riskStatus ?? '').toLowerCase();
    if (normalized === 'off_track') return 'Off track';
    if (normalized === 'at_risk') return 'At risk';
    return 'On track';
  }

  riskClass(riskStatus: string): string {
    const normalized = (riskStatus ?? '').toLowerCase();
    if (normalized === 'off_track') return 'pill refused';
    if (normalized === 'at_risk') return 'pill pending';
    return 'pill approved';
  }

  formatPeriodLabel(startDate: string, endDate: string): string {
    return `${this.formatDateFr(startDate)} au ${this.formatDateFr(endDate)}`;
  }

  onNotifications(): void {}

  daysUntilReturn(endDate: string): number {
    const today = this.parseDate(this.referenceDate);
    const end = this.parseDate(endDate);
    return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
  }

  setPipelineSortKey(key: 'startDate' | 'requestedAt'): void {
    this.pipelineSortKey = key;
  }

  toggleApprovedSort(): void {
    this.approvedSortDir = this.approvedSortDir === 'asc' ? 'desc' : 'asc';
  }

  loadContinuityPlans(): void {
    if (!this.managerEmployeeId) return;
    this.continuityPlansLoading = true;
    this.advancedAbsenceService.getContinuityPlans(this.managerEmployeeId).subscribe({
      next: (plans) => {
        this.continuityPlans = plans;
        this.continuityPlansLoading = false;
      },
      error: () => { this.continuityPlansLoading = false; }
    });
  }

  isRequestBackupAssigned(requestId: number): boolean {
    return this.calendarItems.some((item) => item.requestId === requestId && item.backupAssigned);
  }

  get filteredBackups() {
    const q = this.backupSearchQuery.toLowerCase().trim();
    const list = this.dashboard?.teamBackups ?? [];
    return q ? list.filter(b => (b.employeeName + ' ' + b.roleLabel).toLowerCase().includes(q)) : list;
  }

  selectBackup(employeeId: number, name: string, role: string): void {
    this.selectedBackupEmployeeId = employeeId;
    this.backupSearchQuery = name + (role ? ' — ' + role : '');
    this.backupDropdownOpen = false;
    this.checkBackupConflict();
  }

  clearBackup(): void {
    this.selectedBackupEmployeeId = null;
    this.backupSearchQuery = '';
    this.backupDropdownOpen = false;
    this.backupConflictWarning = '';
  }

  closeBackupDropdown(): void {
    // Small delay so mousedown on a list item fires before blur closes the dropdown
    setTimeout(() => { this.backupDropdownOpen = false; }, 150);
  }

  checkBackupConflict(): void {
    this.backupConflictWarning = '';
    if (!this.selectedBackupEmployeeId || !this.selectedRequestIdForPlan) return;
    const req = this.approvedRequests.find((r) => r.requestId === this.selectedRequestIdForPlan);
    if (!req) return;
    const reqStart = this.parseDate(req.startDate);
    const reqEnd = this.parseDate(req.endDate);
    // On vérifie sur l'ensemble des demandes approuvées de l'équipe (pas seulement le calendrier de la
    // période affichée) afin de détecter un chevauchement même hors du mois/semaine visible à l'écran.
    const backupIsAbsent = this.pipelineRequests.some(
      (item) =>
        item.employeeId === this.selectedBackupEmployeeId &&
        item.status === 'approuvee' &&
        this.parseDate(item.startDate) <= reqEnd &&
        this.parseDate(item.endDate) >= reqStart
    );
    if (backupIsAbsent) {
      this.backupConflictWarning = 'Ce backup est déjà absent pendant la période couverte par cette absence : il ne peut pas être désigné comme backup.';
    }
  }

  returnLabel(endDate: string): string {
    const days = this.daysUntilReturn(endDate);
    if (days === 0) return "Retour aujourd'hui";
    if (days === 1) return 'Retour demain';
    return `Retour dans ${days} jours`;
  }

  loadMonthlyTrend(): void {
    if (!this.managerEmployeeId) return;
    const shortMonths = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const calls = [];
    const labels: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      labels.push(shortMonths[d.getMonth()]);
      calls.push(this.advancedAbsenceService.getDashboard(this.managerEmployeeId!, 'monthly', d.toISOString().slice(0, 10), this.tensionThreshold));
    }
    this.monthlyTrendLabels = labels;
    forkJoin(calls.map((call) => call.pipe(catchError(() => of(null))))).subscribe({
      next: (results) => {
        this.monthlyTrendData = results.map((r) => r?.cumulativeAbsenceDays ?? 0);
        setTimeout(() => this.initOrUpdateBarChart(), 0);
      },
      error: () => {
        this.monthlyTrendData = Array(12).fill(0);
        setTimeout(() => this.initOrUpdateBarChart(), 0);
      }
    });
  }

  initOrUpdateBarChart(): void {
    if (!this.barCanvasRef?.nativeElement) return;
    const data = this.monthlyTrendData.length ? this.monthlyTrendData : Array(12).fill(0);
    const labels = this.monthlyTrendLabels.length ? this.monthlyTrendLabels : Array(12).fill('');
    const currentIdx = data.length - 1;
    const bgColors = data.map((_, i) => i === currentIdx ? '#2563eb' : '#bfdbfe');
    if (this.barChart) {
      this.barChart.data.labels = labels;
      (this.barChart.data.datasets[0] as any).data = data;
      (this.barChart.data.datasets[0] as any).backgroundColor = bgColors;
      this.barChart.update();
      return;
    }
    this.barChart = new Chart(this.barCanvasRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderRadius: 4,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw} jours` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8' }, border: { display: false } },
          y: { grid: { color: '#e2e8f0' }, ticks: { color: '#94a3b8', stepSize: 10 }, border: { display: false } }
        }
      }
    });
  }

  exportExcel(): void {
    const today = new Date().toISOString().slice(0, 10);
    const absencesHeader = ['Collaborateur', 'Type', 'Début', 'Fin', 'Jours', 'Statut', 'Backup assigné', 'Backup'];
    const absencesRows = this.calendarItems.map((item) => [
      item.employeeName,
      this.absenceTypeLabel(item.absenceType),
      item.startDate,
      item.endDate,
      this.calcDays(item.startDate, item.endDate),
      this.statusLabel(item.status),
      item.backupAssigned ? 'Oui' : 'Non',
      item.backupEmployeeName ?? ''
    ]);

    const pipelineHeader = ['Collaborateur', 'Type', 'Début', 'Fin', 'Durée', 'Statut', 'Conflits détectés'];
    const pipelineRows = this.pipelineRequests.map((req) => [
      req.employeeName,
      this.absenceTypeLabel(req.absenceType),
      req.startDate,
      req.endDate,
      this.calcDays(req.startDate, req.endDate),
      this.statusLabel(req.status),
      req.conflictsDetected ? 'Oui' : 'Non'
    ]);

    const kpiRows = [
      ['Indicateur', 'Valeur'],
      ['Jours d\'absence cumulés (mois)', this.cumulativeAbsenceDays],
      ['Jours M-1', this.dashboard?.prevMonthAbsenceDays ?? 0],
      ['Disponibles aujourd\'hui', `${this.teamAvailability.available}/${this.teamAvailability.total}`],
      ['Taux de disponibilité', `${this.teamAvailability.pct.toFixed(1)}%`],
      ['Congés actifs', this.dashboard?.activeApprovedAbsences ?? 0],
      ['Taux d\'absence équipe', `${this.absenceRatePercent.toFixed(1)}%`],
    ];

    import('xlsx/xlsx.mjs').then((XLSX) => {
      const wb = XLSX.utils.book_new();

      const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
      XLSX.utils.book_append_sheet(wb, wsKpi, 'KPIs');

      const wsAbsences = XLSX.utils.aoa_to_sheet([absencesHeader, ...absencesRows]);
      XLSX.utils.book_append_sheet(wb, wsAbsences, 'Absences');

      const wsPipeline = XLSX.utils.aoa_to_sheet([pipelineHeader, ...pipelineRows]);
      XLSX.utils.book_append_sheet(wb, wsPipeline, 'Pipeline');

      XLSX.writeFile(wb, `rapport-absences-${today}.xlsx`);
    });
  }

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil(): void {
    this.router.navigate(['/profil']);
  }

  private ensureSelections(): void {
    const pending = this.pendingRequests;
    const approved = this.approvedRequests;
    if (!this.selectedRequestIdForAlternatives || !pending.some((request) => request.requestId === this.selectedRequestIdForAlternatives)) {
      this.selectedRequestIdForAlternatives = pending.length ? pending[0].requestId : null;
    }
    if (!this.selectedRequestIdForPlan || !approved.some((request) => request.requestId === this.selectedRequestIdForPlan)) {
      this.selectedRequestIdForPlan = approved.length ? approved[0].requestId : null;
    }
    if (this.selectedBackupEmployeeId != null && !this.dashboard?.teamBackups.some((item) => item.employeeId === this.selectedBackupEmployeeId)) {
      this.selectedBackupEmployeeId = null;
    }
  }

  private syncDisplayMonth(): void {
    const parsed = this.parseDate(this.referenceDate);
    if (Number.isNaN(parsed.getTime())) return;
    this.displayMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  }

  private parseDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map((value) => Number(value));
    return new Date(year, month - 1, day);
  }

  private workingDaysInRange(start: Date, end: Date): number {
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  formatDateFr(ymd: string): string {
    const parsed = this.parseDate(ymd);
    if (Number.isNaN(parsed.getTime())) return ymd;
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(parsed);
    return formatted.replace(/(^\d+\s+)(\p{L})/u, (_, prefix: string, first: string) => `${prefix}${first.toUpperCase()}`);
  }

  private isInRange(day: Date, start: Date, end: Date): boolean {
    return day >= start && day <= end;
  }
}
