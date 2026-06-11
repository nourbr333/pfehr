import { CommonModule, DatePipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService, Utilisateur } from '../../services/auth';
import {
  EvaluationTrend,
  PerformanceEvaluationCycle,
  PerformanceEvaluationsService
} from '../../services/performance-evaluations.service';
import { DepartmentService } from '../../services/department.service';
import { EmployeeService } from '../../services/employee.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { EvaluationReminder, EvaluationReminderService } from '../../services/evaluation-reminder.service';

export type TabId = 'vue' | 'cycles' | 'analytics' | 'actions';

type SortKey = 'employeeName' | 'managerName' | 'departmentName' | 'jobTitle' | 'lastEvaluationDate' | 'score' | 'status';

export interface DeptAverage {
  label: string;
  score: number;
}

@Component({
  selector: 'app-performances-evaluations',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './performances-evaluations.component.html',
  styleUrl: './performances-evaluations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PerformancesEvaluationsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('deptCanvas')        deptCanvas?:       ElementRef<HTMLCanvasElement>;
  @ViewChild('statusCanvas')      statusCanvas?:     ElementRef<HTMLCanvasElement>;
  @ViewChild('distCanvas')        distCanvas?:       ElementRef<HTMLCanvasElement>;
  @ViewChild('evolutionCanvas')   evolutionCanvas?:  ElementRef<HTMLCanvasElement>;
  @ViewChild('scatterCanvas')     scatterCanvas?:    ElementRef<HTMLCanvasElement>;
  @ViewChild('distFineCanvas')     distFineCanvas?:   ElementRef<HTMLCanvasElement>;

  private static chartsRegistered = false;

  readonly router                  = inject(Router);
  private readonly auth            = inject(AuthService);
  private readonly dataService     = inject(PerformanceEvaluationsService);
  private readonly deptService     = inject(DepartmentService);
  private readonly employeeService = inject(EmployeeService);
  private readonly cdr             = inject(ChangeDetectorRef);
  private readonly destroyRef      = inject(DestroyRef);
  private readonly platformId      = inject(PLATFORM_ID);
  private readonly reminderService = inject(EvaluationReminderService);

  private deptChart:       Chart | null = null;
  private statusChart:     Chart | null = null;
  private distChart:       Chart | null = null;
  private evolutionChart:  Chart | null = null;
  private scatterChart:    Chart | null = null;
  private distFineChart:   Chart | null = null;

  readonly utilisateur: Utilisateur | null = this.auth.getCurrentUser();
  readonly topThreshold = 85;
  readonly riskThreshold = 65;
  readonly pageSize = 8;
  readonly currentYear = new Date().getFullYear();
  readonly scatterPalette = ['#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#7c3aed'];

  allCycles: PerformanceEvaluationCycle[] = [];
  allDepartmentNames: string[] = [];
  allManagerNames: string[] = [];
  selectedCycle: PerformanceEvaluationCycle | null = null;
  isLoading = true;

  activeTab: TabId = 'vue';

  selectedPeriod: 'month' | 'quarter' | 'year' = 'month';
  selectedDepartment = '';
  selectedJobTitle = '';
  selectedManager = '';
  selectedStatus = '';
  topSearchTerm = '';

  sortKey: SortKey = 'lastEvaluationDate';
  sortDirection: 'asc' | 'desc' = 'desc';
  currentPage = 1;

  // ─── Phase 8A: Relances ───
  reminderHistory: EvaluationReminder[] = [];
  reminderLoadingState: Record<number, 'loading'> = {};
  reminderHistoryLoading = false;
  reminderError = '';
  lateCyclesPage = 1;
  reminderHistoryPage = 1;
  readonly actionsTablePageSize = 10;

  constructor() {
    if (!PerformancesEvaluationsComponent.chartsRegistered) {
      Chart.register(...registerables);
      PerformancesEvaluationsComponent.chartsRegistered = true;
    }
  }

  ngOnInit(): void {
    if (!this.utilisateur) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadCycles();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.renderCharts();
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/accueil-resp';
  }

  get departments(): string[] {
    return this.allDepartmentNames.length > 0
      ? this.allDepartmentNames
      : this.uniqueBy((item) => item.departmentName);
  }

  get jobTitles(): string[] {
    return this.uniqueBy((item) => item.jobTitle);
  }

  get managers(): string[] {
    return this.allManagerNames.length > 0
      ? this.allManagerNames
      : this.uniqueBy((item) => item.managerName);
  }

  get filteredCycles(): PerformanceEvaluationCycle[] {
    return this.allCycles.filter((cycle) => this.matchesPeriod(cycle) && this.matchesSelections(cycle));
  }

  get sortedCycles(): PerformanceEvaluationCycle[] {
    const sorted = [...this.filteredCycles];
    sorted.sort((left, right) => this.compareCycles(left, right));
    return sorted;
  }

  get paginatedCycles(): PerformanceEvaluationCycle[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.sortedCycles.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.sortedCycles.length / this.pageSize));
  }

  get canGoPrevious(): boolean {
    return this.currentPage > 1;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages;
  }

  get completedEvaluationsCount(): number {
    return this.filteredCycles.filter((cycle) => cycle.status === 'Complété').length;
  }

  get globalAverageScore(): number {
    const evaluated = this.filteredCycles.filter((c) => c.score > 0);
    if (!evaluated.length) return 0;
    const total = evaluated.reduce((sum, c) => sum + c.score, 0);
    return Number((total / evaluated.length).toFixed(1));
  }

  get topPerformersPercent(): number {
    const evaluated = this.filteredCycles.filter((c) => c.score > 0);
    if (!evaluated.length) return 0;
    const topCount = evaluated.filter((c) => c.score >= this.topThreshold).length;
    return Math.round((topCount / evaluated.length) * 100);
  }

  get atRiskPercent(): number {
    const evaluated = this.filteredCycles.filter((c) => c.score > 0);
    if (!evaluated.length) return 0;
    const atRiskCount = evaluated.filter((c) => c.score <= this.riskThreshold).length;
    return Math.round((atRiskCount / evaluated.length) * 100);
  }

  get completionRate(): number {
    if (!this.filteredCycles.length) return 0;
    const done = this.filteredCycles.filter((c) => c.status === 'Complété').length;
    return Number(((done / this.filteredCycles.length) * 100).toFixed(1));
  }

  get medianScore(): number {
    const scores = this.filteredCycles
      .map((c) => c.score)
      .filter((s) => s > 0)
      .sort((a, b) => a - b);
    if (!scores.length) return 0;
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 === 0
      ? (scores[mid - 1] + scores[mid]) / 2
      : scores[mid];
    return Number(median.toFixed(1));
  }

  get scoreStdDev(): number {
    const scores = this.filteredCycles.map((c) => c.score).filter((s) => s > 0);
    if (scores.length < 2) return 0;
    const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
    return Number(Math.sqrt(variance).toFixed(1));
  }

  get netVelocity(): string {
    if (!this.filteredCycles.length) return '0';
    const up   = this.filteredCycles.filter((c) => c.trend === 'up').length;
    const down = this.filteredCycles.filter((c) => c.trend === 'down').length;
    const val  = Math.round(((up - down) / this.filteredCycles.length) * 100);
    return val > 0 ? `+${val}` : `${val}`;
  }

  get scoreFineDistribution(): { label: string; count: number; color: string }[] {
    const slices = Array.from({ length: 10 }, (_, i) => {
      const min = i * 10;
      const max = i === 9 ? 100 : min + 9;
      const label = i === 9 ? '90–100' : `${min}–${max}`;
      let color: string;
      if (max < 50)       color = '#dc2626';
      else if (max < 70)  color = '#f59e0b';
      else if (max < 80)  color = '#2563eb';
      else                color = '#16a34a';
      const count = this.filteredCycles.filter((c) => c.score >= min && c.score <= max).length;
      return { label, count, color };
    });
    return slices;
  }

  get scatterData(): { label: string; data: { x: number; y: number; employeeName: string }[]; backgroundColor: string; pointRadius: number; pointHoverRadius: number }[] {
    const depts = this.allDepartmentNames.length > 0
      ? this.allDepartmentNames
      : Array.from(new Set(this.filteredCycles.map((c) => c.departmentName))).sort();
    return depts
      .map((dept, idx) => {
        const color = this.scatterPalette[idx % this.scatterPalette.length];
        const points = this.filteredCycles
          .filter((c) => c.departmentName === dept && c.score > 0)
          .map((c) => {
            const trendVal = c.trend === 'up' ? 1 : c.trend === 'down' ? -1 : 0;
            return {
              x: Math.round((c.score + (Math.random() * 0.6 - 0.3)) * 10) / 10,
              y: Math.round((trendVal + (Math.random() * 0.16 - 0.08)) * 1000) / 1000,
              employeeName: c.employeeName
            };
          });
        return { label: dept, data: points, backgroundColor: color, pointRadius: 5, pointHoverRadius: 7 };
      })
      .filter((ds) => ds.data.length > 0);
  }

  get topPerformers(): PerformanceEvaluationCycle[] {
    return [...this.filteredCycles]
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
  }

  get atRiskProfiles(): PerformanceEvaluationCycle[] {
    return [...this.filteredCycles]
      .filter((cycle) => cycle.score <= this.riskThreshold)
      .sort((left, right) => {
        if (left.score === right.score) {
          return this.trendWeight(left.trend) - this.trendWeight(right.trend);
        }
        return left.score - right.score;
      })
      .slice(0, 5);
  }

  get inProgressCount(): number {
    return this.filteredCycles.filter((c) => c.status === 'En cours').length;
  }

  get overdueCount(): number {
    return this.filteredCycles.filter((c) => c.status === 'En retard').length;
  }

  /** Cycles en retard actionnables (sans relance en cours non traitée). */
  get lateCycles(): PerformanceEvaluationCycle[] {
    const pendingIds = new Set(
      this.reminderHistory
        .filter((r) => r.status === 'Non traité')
        .map((r) => r.employeeId)
    );
    return this.allCycles
      .filter((c) => c.status === 'En retard' && !pendingIds.has(c.employeeId))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  get lateCount(): number {
    return this.lateCycles.length;
  }

  get paginatedLateCycles(): PerformanceEvaluationCycle[] {
    const start = (this.lateCyclesPage - 1) * this.actionsTablePageSize;
    return this.lateCycles.slice(start, start + this.actionsTablePageSize);
  }

  get lateCyclesTotalPages(): number {
    return Math.max(1, Math.ceil(this.lateCycles.length / this.actionsTablePageSize));
  }

  get canGoLatePrevious(): boolean {
    return this.lateCyclesPage > 1;
  }

  get canGoLateNext(): boolean {
    return this.lateCyclesPage < this.lateCyclesTotalPages;
  }

  previousLatePage(): void {
    this.lateCyclesPage = Math.max(1, this.lateCyclesPage - 1);
    this.cdr.markForCheck();
  }

  nextLatePage(): void {
    this.lateCyclesPage = Math.min(this.lateCyclesTotalPages, this.lateCyclesPage + 1);
    this.cdr.markForCheck();
  }

  private clampLateCyclesPage(): void {
    this.lateCyclesPage = Math.min(this.lateCyclesPage, this.lateCyclesTotalPages);
  }

  get paginatedReminderHistory(): EvaluationReminder[] {
    const start = (this.reminderHistoryPage - 1) * this.actionsTablePageSize;
    return this.reminderHistory.slice(start, start + this.actionsTablePageSize);
  }

  get reminderHistoryTotalPages(): number {
    return Math.max(1, Math.ceil(this.reminderHistory.length / this.actionsTablePageSize));
  }

  get canGoHistoryPrevious(): boolean {
    return this.reminderHistoryPage > 1;
  }

  get canGoHistoryNext(): boolean {
    return this.reminderHistoryPage < this.reminderHistoryTotalPages;
  }

  previousHistoryPage(): void {
    this.reminderHistoryPage = Math.max(1, this.reminderHistoryPage - 1);
    this.cdr.markForCheck();
  }

  nextHistoryPage(): void {
    this.reminderHistoryPage = Math.min(this.reminderHistoryTotalPages, this.reminderHistoryPage + 1);
    this.cdr.markForCheck();
  }

  private clampReminderHistoryPage(): void {
    this.reminderHistoryPage = Math.min(this.reminderHistoryPage, this.reminderHistoryTotalPages);
  }

  get totalFilteredCount(): number {
    return this.filteredCycles.length;
  }

  get periodLabel(): string {
    const now = new Date();
    if (this.selectedPeriod === 'year') return `Année ${now.getFullYear()}`;
    if (this.selectedPeriod === 'quarter') {
      const q = Math.floor(now.getMonth() / 3) + 1;
      return `T${q} ${now.getFullYear()}`;
    }
    return now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  get departmentAverages(): DeptAverage[] {
    const group = new Map<string, number[]>();
    this.filteredCycles.forEach((cycle) => {
      if (cycle.score <= 0) return;
      const list = group.get(cycle.departmentName) ?? [];
      list.push(cycle.score);
      group.set(cycle.departmentName, list);
    });
    // Use real dept names as base so chart always shows all departments
    const baseNames = this.allDepartmentNames.length > 0
      ? this.allDepartmentNames
      : Array.from(group.keys());
    return baseNames
      .map((label) => {
        const values = group.get(label);
        return {
          label,
          score: values?.length
            ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
            : 0
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  get scoreDistribution(): { label: string; count: number; color: string }[] {
    const ranges = [
      { label: '90–100', min: 90, max: 100, color: '#16a34a' },
      { label: '80–89',  min: 80, max: 89,  color: '#22c55e' },
      { label: '70–79',  min: 70, max: 79,  color: '#2563eb' },
      { label: '60–69',  min: 60, max: 69,  color: '#f59e0b' },
      { label: '< 60',   min: 1,  max: 59,  color: '#dc2626' },
    ];
    return ranges.map((r) => ({
      label: r.label,
      count: this.filteredCycles.filter((c) => c.score >= r.min && c.score <= r.max).length,
      color: r.color
    }));
  }

  get monthlyEvolution(): (number | null)[] {
    const currentYear = new Date().getFullYear();
    const groups: number[][] = Array.from({ length: 12 }, () => []);
    this.allCycles
      .filter((cycle) => this.matchesSelections(cycle))
      .forEach((cycle) => {
        if (cycle.score <= 0) return;
        const d = new Date(`${cycle.lastEvaluationDate}T00:00:00`);
        if (Number.isNaN(d.getTime())) return;
        if (d.getFullYear() !== currentYear) return;
        groups[d.getMonth()].push(cycle.score);
      });
    return groups.map((scores) =>
      scores.length ? Number((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : null
    );
  }

  /**
   * Cycles used for the heatmap: filtered only by period + department,
   * so the grid always shows all managers vs all departments even when
   * the manager/status/search filters are active.
   */
  private get heatmapCycles(): PerformanceEvaluationCycle[] {
    return this.allCycles.filter((cycle) => {
      const periodOk = this.matchesPeriod(cycle);
      const deptOk   = this.selectedDepartment ? cycle.departmentName === this.selectedDepartment : true;
      return periodOk && deptOk;
    });
  }

  get heatmapManagers(): string[] {
    // Use allManagerNames (loaded from DB) when available; fall back to what's in cycles
    if (this.allManagerNames.length > 0) return this.allManagerNames;
    return Array.from(new Set(this.heatmapCycles.map((c) => c.managerName).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  get heatmapData(): { dept: string; cells: { managerName: string; score: number | null }[] }[] {
    const managers = this.heatmapManagers;
    const depts = this.allDepartmentNames.length > 0
      ? this.allDepartmentNames
      : Array.from(new Set(this.heatmapCycles.map((c) => c.departmentName))).sort();
    const source = this.heatmapCycles;
    return depts.map((dept) => ({
      dept,
      cells: managers.map((mgr) => {
        const cycles = source.filter(
          (c) => c.departmentName === dept && c.managerName === mgr
        );
        return {
          managerName: mgr,
          score: cycles.length
            ? Math.round(cycles.reduce((s, c) => s + c.score, 0) / cycles.length)
            : null
        };
      })
    }));
  }

  get weakSignals(): { label: string; detail: string; type: 'risk' | 'opportunity' | 'warning' }[] {
    const signals: { label: string; detail: string; type: 'risk' | 'opportunity' | 'warning' }[] = [];
    this.filteredCycles
      .filter((c) => c.score <= this.riskThreshold && c.trend === 'down')
      .slice(0, 3)
      .forEach((c) => signals.push({
        label: `${c.employeeName} (${c.departmentName}) — score ${c.score}`,
        detail: `Tendance en baisse · Manager : ${c.managerName}`,
        type: 'risk'
      }));
    this.departmentAverages
      .filter((d) => d.score > 0 && d.score < 70)
      .slice(0, 2)
      .forEach((d) => signals.push({
        label: `${d.label} — score moyen ${d.score}/100`,
        detail: `Département avec plusieurs profils en difficulté`,
        type: 'warning'
      }));
    this.filteredCycles
      .filter((c) => c.score >= this.topThreshold && c.trend === 'up')
      .slice(0, 2)
      .forEach((c) => signals.push({
        label: `${c.employeeName} — candidat fort pour promotion`,
        detail: `Score ${c.score} · Tendance ↑ · ${c.departmentName}`,
        type: 'opportunity'
      }));
    return signals;
  }

  get analyticsAlert(): { strong: string; text: string } | null {
    const worstDept = this.departmentAverages.find((d) => d.score > 0 && d.score < 70);
    if (worstDept) {
      return {
        strong: 'Tendance préoccupante :',
        text: `${worstDept.label} enregistre un score moyen de ${worstDept.score}/100. Intervention recommandée.`
      };
    }
    const atRiskCount = this.filteredCycles.filter((c) => c.status === 'En retard' || c.trend === 'down').length;
    if (atRiskCount > 2) {
      return {
        strong: `${atRiskCount} profil(s) nécessitent une attention :`,
        text: `Scores en baisse ou cycles en retard détectés sur la période sélectionnée.`
      };
    }
    return null;
  }

  deptBarColor(score: number): string {
    if (score >= this.topThreshold) return 'green';
    if (score >= 70) return 'blue';
    if (score >= this.riskThreshold) return 'orange';
    return 'red';
  }

  heatmapBadgeClass(score: number | null): string {
    if (score === null) return 'score-badge gray';
    if (score >= this.topThreshold) return 'score-badge green';
    if (score >= 70) return 'score-badge blue';
    if (score >= this.riskThreshold) return 'score-badge orange';
    return 'score-badge red';
  }

  switchTab(tab: TabId): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
    if (isPlatformBrowser(this.platformId)) {
      if (tab === 'vue') {
        setTimeout(() => this.renderCharts());
      } else if (tab === 'analytics') {
        setTimeout(() => this.renderAnalyticsCharts());
      } else if (tab === 'actions') {
        this.loadReminderHistory();
        this.refreshCyclesForActions();
      }
    }
  }

  sendReminder(cycle: PerformanceEvaluationCycle): void {
    if (!cycle.hasManager || this.reminderLoadingState[cycle.employeeId]) return;
    this.reminderError = '';
    this.reminderLoadingState[cycle.employeeId] = 'loading';
    this.cdr.markForCheck();
    this.reminderService.sendReminder(cycle.employeeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reminder) => {
          delete this.reminderLoadingState[cycle.employeeId];
          this.reminderHistory = [{ ...reminder, status: reminder.status ?? 'Non traité' }, ...this.reminderHistory];
          this.clampLateCyclesPage();
          this.clampReminderHistoryPage();
          this.cdr.markForCheck();
        },
        error: (err) => {
          delete this.reminderLoadingState[cycle.employeeId];
          const body = err?.error;
          this.reminderError = (typeof body === 'string' ? body : body?.message)
            || 'Impossible d\'envoyer la relance.';
          this.cdr.markForCheck();
        }
      });
  }

  isReminderLoading(employeeId: number): boolean {
    return !!this.reminderLoadingState[employeeId];
  }

  formatLastEvaluation(cycle: PerformanceEvaluationCycle): string {
    if (cycle.neverEvaluated || !cycle.lastEvaluationDate) return '—';
    const d = new Date(`${cycle.lastEvaluationDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR');
  }

  private loadReminderHistory(): void {
    this.reminderHistoryLoading = true;
    this.cdr.markForCheck();
    this.reminderService.getHistory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (history) => {
          this.reminderHistory = history;
          this.reminderHistoryLoading = false;
          this.clampReminderHistoryPage();
          this.cdr.markForCheck();
        },
        error: () => {
          this.reminderHistoryLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Rafraîchit les cycles pour mettre à jour statuts et liste « en retard ». */
  private refreshCyclesForActions(): void {
    this.dataService.getEvaluationCycles()
      .pipe(takeUntilDestroyed(this.destroyRef), catchError(() => of([])))
      .subscribe((cycles) => {
        this.allCycles = cycles;
        this.clampLateCyclesPage();
        this.cdr.markForCheck();
      });
  }

  onFiltersChanged(): void {
    this.currentPage = 1;
    if (this.selectedCycle && !this.filteredCycles.some((cycle) => cycle.cycleId === this.selectedCycle?.cycleId)) {
      this.selectedCycle = null;
    }
    this.cdr.markForCheck();
    if (isPlatformBrowser(this.platformId)) {
      if (this.activeTab === 'vue') {
        setTimeout(() => this.renderCharts());
      } else if (this.activeTab === 'analytics') {
        setTimeout(() => this.renderAnalyticsCharts());
      }
    }
  }

  resetFilters(): void {
    this.selectedPeriod = 'month';
    this.selectedDepartment = '';
    this.selectedJobTitle = '';
    this.selectedManager = '';
    this.selectedStatus = '';
    this.topSearchTerm = '';
    this.onFiltersChanged();
  }

  onSort(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = key === 'score' ? 'desc' : 'asc';
    }
    this.currentPage = 1;
  }

  previousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  nextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  onSelectCycle(cycle: PerformanceEvaluationCycle): void {
    this.selectedCycle = cycle;
  }

  onNotifications(): void {}

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil(): void {
    this.router.navigate(['/profil']);
  }

  exportExcel(): void {
    const header = ['Nom collaborateur', 'Manager', 'Département', 'Poste', 'Date évaluation', 'Score', 'Statut', 'Tendance'];
    const rows = this.sortedCycles.map((c) => [
      c.employeeName,
      c.managerName,
      c.departmentName,
      c.jobTitle,
      c.lastEvaluationDate,
      c.score,
      c.status,
      this.trendLabel(c.trend)
    ]);
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Evaluations');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `evaluations_${today}.xlsx`);
    });
  }

  scoreBadgeClass(score: number): string {
    if (score >= this.topThreshold) return 'score-badge green';
    if (score >= 70) return 'score-badge orange';
    return 'score-badge red';
  }

  statusBadgeClass(status: string): string {
    if (status === 'Complété') return 'status-badge status-completed';
    if (status === 'En retard') return 'status-badge status-late';
    return 'status-badge status-progress';
  }

  get paginationLabel(): string {
    const total = this.filteredCycles.length;
    if (!total) return '0 collaborateur';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, total);
    return `${start}-${end} sur ${total} collaborateurs`;
  }

  trendLabel(trend: EvaluationTrend): string {
    if (trend === 'up') return 'En hausse';
    if (trend === 'down') return 'En baisse';
    return 'Stable';
  }

  sortArrowFor(key: SortKey): string {
    if (this.sortKey !== key) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  private loadCycles(): void {
    this.isLoading = true;
    forkJoin({
      cycles:      this.dataService.getEvaluationCycles().pipe(catchError(() => of([]))),
      departments: this.deptService.getAllDepartments().pipe(catchError(() => of([]))),
      employees:   this.employeeService.getAllEmployees().pipe(catchError(() => of([]))),
      reminders:   this.reminderService.getHistory().pipe(catchError(() => of([])))
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ cycles, departments, employees, reminders }) => {
        this.allCycles = cycles;
        this.reminderHistory = reminders;
        this.clampLateCyclesPage();
        this.clampReminderHistoryPage();
        this.selectedCycle = null;
        this.allDepartmentNames = departments
          .map((d) => d.departmentName)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        this.allManagerNames = employees
          .filter((e) => e.isManager === true)
          .map((e) => `${e.firstName} ${e.lastName}`.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        this.isLoading = false;
        this.currentPage = 1;
        this.cdr.markForCheck();
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.renderCharts());
        }
      });
  }

  private uniqueBy(pick: (cycle: PerformanceEvaluationCycle) => string): string[] {
    return Array.from(new Set(this.allCycles.map(pick).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  private matchesSelections(cycle: PerformanceEvaluationCycle): boolean {
    const departmentMatch = this.selectedDepartment ? cycle.departmentName === this.selectedDepartment : true;
    const jobMatch = this.selectedJobTitle ? cycle.jobTitle === this.selectedJobTitle : true;
    const managerMatch = this.selectedManager ? cycle.managerName === this.selectedManager : true;
    const statusMatch = this.selectedStatus ? cycle.status === this.selectedStatus : true;
    const query = this.topSearchTerm.trim().toLowerCase();
    const searchMatch = query
      ? cycle.employeeName.toLowerCase().includes(query)
        || cycle.managerName.toLowerCase().includes(query)
        || cycle.departmentName.toLowerCase().includes(query)
      : true;
    return departmentMatch && jobMatch && managerMatch && statusMatch && searchMatch;
  }

  private get currentRange(): { start: Date; end: Date } {
    const now = new Date();
    if (this.selectedPeriod === 'year') {
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999) };
    }
    if (this.selectedPeriod === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999) };
    }
    // month
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
  }

  private matchesPeriod(cycle: PerformanceEvaluationCycle): boolean {
    const date = new Date(`${cycle.lastEvaluationDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const { start, end } = this.currentRange;
    return date >= start && date <= end;
  }

  private compareCycles(left: PerformanceEvaluationCycle, right: PerformanceEvaluationCycle): number {
    const leftValue = this.sortValue(left, this.sortKey);
    const rightValue = this.sortValue(right, this.sortKey);
    const compare = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    return this.sortDirection === 'asc' ? compare : -compare;
  }

  private sortValue(cycle: PerformanceEvaluationCycle, key: SortKey): string | number {
    if (key === 'score') return cycle.score;
    if (key === 'lastEvaluationDate') return new Date(cycle.lastEvaluationDate).getTime();
    return cycle[key].toString().toLowerCase();
  }

  private trendWeight(trend: EvaluationTrend): number {
    if (trend === 'down') return 0;
    if (trend === 'stable') return 1;
    return 2;
  }

  private renderCharts(): void {
    this.renderDeptChart();
    this.renderStatusChart();
  }

  private renderAnalyticsCharts(): void {
    this.renderDistributionChart();
    this.renderEvolutionChart();
    this.renderScatterChart();
    this.renderDistFineChart();
  }

  private renderDistributionChart(): void {
    this.distChart?.destroy();
    this.distChart = null;
    if (!this.distCanvas) return;

    const data = this.scoreDistribution;
    this.distChart = new Chart(this.distCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          label: "Nombre d'collaborateurs",
          data: data.map((d) => d.count),
          backgroundColor: data.map((d) => d.color),
          borderRadius: 6,
          maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 }, stepSize: 1 },
            grid: { color: '#e2e8f0' }
          },
          y: {
            ticks: { color: '#374151', font: { family: 'DM Sans', size: 12 } },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x} collaborateur(s)` } }
        }
      }
    });
  }

  private renderEvolutionChart(): void {
    this.evolutionChart?.destroy();
    this.evolutionChart = null;
    if (!this.evolutionCanvas) return;

    const currentYear = new Date().getFullYear();
    const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const values = this.monthlyEvolution;

    this.evolutionChart = new Chart(this.evolutionCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Score moyen global',
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.08)',
          pointBackgroundColor: '#2563eb',
          pointRadius: 4,
          tension: 0.3,
          fill: true,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 } },
            grid: { color: '#e2e8f0' }
          },
          x: {
            ticks: { color: '#374151', font: { family: 'DM Sans', size: 12 } },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` Score moyen : ${ctx.parsed.y}` } }
        }
      }
    });
  }

  private renderDistFineChart(): void {
    this.distFineChart?.destroy();
    this.distFineChart = null;
    if (!this.distFineCanvas) return;

    const data = this.scoreFineDistribution;
    this.distFineChart = new Chart(this.distFineCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.label),
        datasets: [
          {
            type: 'bar' as const,
            label: 'Effectif par tranche',
            data: data.map((d) => d.count),
            backgroundColor: '#2563eb',
            borderRadius: 4,
            maxBarThickness: 28,
            order: 2
          },
          {
            type: 'line' as const,
            label: 'Courbe densité',
            data: data.map((d) => d.count),
            borderColor: '#d97706',
            backgroundColor: 'transparent',
            tension: 0.4,
            fill: false,
            pointRadius: 3,
            pointBackgroundColor: '#d97706',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 4, bottom: 0, left: 0, right: 0 } },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 }, stepSize: 1 },
            grid: { color: '#e2e8f0' }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: '#374151',
              font: { family: 'DM Sans', size: 11 },
              padding: 8,
              usePointStyle: true,
              pointStyle: 'rect',
              pointStyleWidth: 12
            }
          },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} collaborateur(s)` } }
        }
      }
    });
  }

  private renderScatterChart(): void {
    this.scatterChart?.destroy();
    this.scatterChart = null;
    if (!this.scatterCanvas) return;

    const quadrantPlugin = {
      id: 'scatter-quadrants',
      afterDatasetsDraw(chart: Chart): void {
        const ctx = chart.ctx;
        const ca  = chart.chartArea;
        const xs  = (chart as any).scales['x'];
        const ys  = (chart as any).scales['y'];
        const xAt75 = xs.getPixelForValue(75);
        const yAt0  = ys.getPixelForValue(0);
        ctx.save();
        // Lignes pointillées
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xAt75, ca.top);    ctx.lineTo(xAt75, ca.bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ca.left, yAt0); ctx.lineTo(ca.right,  yAt0);  ctx.stroke();
        // Labels quadrants
        ctx.setLineDash([]);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.textBaseline = 'top';
        // x>75 y>0 : "À promouvoir" — coin haut droit
        ctx.textAlign = 'right';
        ctx.fillText('À promouvoir', ca.right - 6, ca.top + 6);
        // x<75 y>0 : "Top stable" — coin haut gauche
        ctx.textAlign = 'left';
        ctx.fillText('Top stable', ca.left + 6, ca.top + 6);
        // x<75 y<0 : "En difficulté" — coin bas gauche
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText('En difficulté', ca.left + 6, ca.bottom - 6);
        // x>75 y<0 : "À surveiller" — coin bas droit
        ctx.textAlign = 'right';
        ctx.fillText('À surveiller', ca.right - 6, ca.bottom - 6);
        ctx.restore();
      }
    };

    this.scatterChart = new Chart(this.scatterCanvas.nativeElement, {
      type: 'scatter',
      data: { datasets: this.scatterData as any },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 0, max: 105,
            title: { display: true, text: 'Score', color: '#64748b', font: { family: 'DM Sans', size: 11 } },
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 } },
            grid: { color: '#e2e8f0' }
          },
          y: {
            min: -1.5, max: 1.5,
            ticks: {
              stepSize: 1,
              color: '#64748b',
              font: { family: 'DM Sans', size: 11 },
              callback: (val: number | string) => {
                const n = Number(val);
                if (n === 1)  return '↑ En hausse';
                if (n === 0)  return 'Stable';
                if (n === -1) return '↓ En baisse';
                return '';
              }
            },
            grid: { color: '#e2e8f0' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: import('chart.js').TooltipItem<'scatter'>) => {
                const raw = ctx.raw as { x: number; y: number; employeeName: string };
                return ` ${raw.employeeName} — Score : ${Math.round(raw.x)}`;
              }
            }
          }
        }
      },
      plugins: [quadrantPlugin]
    } as any);
  }

  private renderDeptChart(): void {
    this.deptChart?.destroy();
    this.deptChart = null;
    if (!this.deptCanvas) return;

    const points = this.departmentAverages;
    if (!points.length) return;

    this.deptChart = new Chart(this.deptCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: points.map((d) => d.label),
        datasets: [{
          label: 'Score moyen',
          data: points.map((d) => d.score),
          backgroundColor: points.map((d) => this.scoreColor(d.score)),
          borderRadius: 6,
          maxBarThickness: 32
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            min: 0, max: 100,
            ticks: { color: '#64748b', font: { family: 'DM Sans', size: 11 } },
            grid: { color: '#e2e8f0' }
          },
          y: {
            ticks: { color: '#374151', font: { family: 'DM Sans', size: 12 } },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` Score moyen : ${ctx.parsed.x}` } }
        }
      }
    });
  }

  private renderStatusChart(): void {
    this.statusChart?.destroy();
    this.statusChart = null;
    if (!this.statusCanvas) return;

    const completed  = this.completedEvaluationsCount;
    const inProgress = this.inProgressCount;
    const late       = this.overdueCount;
    const total      = completed + inProgress + late;
    // Always render the doughnut; use placeholder equal segments when no data yet
    const chartData  = total > 0 ? [completed, inProgress, late] : [1, 1, 1];
    const bgColors   = total > 0
      ? ['#16a34a', '#f59e0b', '#dc2626']
      : ['#d1d5db', '#d1d5db', '#d1d5db'];

    this.statusChart = new Chart(this.statusCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels: ['Complétés', 'En cours', 'En retard'],
        datasets: [{
          data: chartData,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#374151', font: { family: 'DM Sans', size: 12 }, padding: 16 }
          }
        }
      }
    });
  }

  private destroyCharts(): void {
    this.deptChart?.destroy();
    this.deptChart = null;
    this.statusChart?.destroy();
    this.statusChart = null;
    this.distChart?.destroy();
    this.distChart = null;
    this.evolutionChart?.destroy();
    this.evolutionChart = null;
    this.scatterChart?.destroy();
    this.scatterChart = null;
    this.distFineChart?.destroy();
    this.distFineChart = null;
  }

  private scoreColor(score: number): string {
    if (score >= this.topThreshold) return '#16a34a';
    if (score >= 70) return '#2563eb';
    if (score >= this.riskThreshold) return '#f59e0b';
    return '#dc2626';
  }
}
