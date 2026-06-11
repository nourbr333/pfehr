import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService, Utilisateur } from '../../services/auth';
import { ManagerService } from '../../services/manager.service';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import { EvaluationService, EmployeeEvaluation } from '../../services/evaluation.service';
import { Chart, registerables } from 'chart.js';
import { catchError, map, of, switchMap, forkJoin } from 'rxjs';
import { AdvancedAbsenceDashboard, ManagerAdvancedAbsencesService } from '../../services/manager-advanced-absences.service';
import { ManagerObjective, ManagerOkrService } from '../../services/manager-okr.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { DashboardFiltersComponent } from '../accueil-resp/components/dashboard-filters/dashboard-filters.component';
import { DashboardPeriod, getCurrentRange, getPreviousRange, isDateInRange } from '../../utils/period-range.util';

interface TeamMemberSnapshot {
  employeeId: number;
  name: string;
  department: string;
  attendanceRate: number;
  absencesDays: number;
  evaluationScore: number;  // 0–100
  latestEvalDate: string | null;
}

interface BradfordLevel {
  label: string;
  color: string;
  count: number;
  pct: number;
}

interface EvalTrendPoint {
  label: string;
  avg: number;
}

@Component({
  selector: 'app-accueil-manager',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, NotificationsPanelComponent, DashboardFiltersComponent],
  templateUrl: './accueil-manager.html',
  styleUrl: './accueil-manager.scss'
})
export class AccueilManagerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('objectiveProgressCanvas') objectiveProgressCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('objectiveStatusCanvas') objectiveStatusCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('absenceTrendCanvas') absenceTrendCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('absenceTypeCanvas') absenceTypeCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('radarTeamCanvas') radarTeamCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('bradfordCanvas') bradfordCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('evalDistCanvas') evalDistCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('evalTrendCanvas') evalTrendCanvas?: ElementRef<HTMLCanvasElement>;

  private static chartsRegistered = false;
  private readonly chartInstances: Chart[] = [];
  private loadingGuardTimer?: ReturnType<typeof setTimeout>;
  private allAttendances: Attendance[] = [];

  utilisateur: Utilisateur | null;
  isLoading = true;

  activeMembersCount = 0;
  teamSize = 0;
  averageObjectiveAchievement = 0;
  averageEngagementScore = 0;
  attendanceRateCurrent = 0;
  attendanceRatePrevious = 0;
  avgEvalPrevious = 0;
  bradfordDistribution: BradfordLevel[] = [];
  topEvaluated: { name: string; score: number }[] = [];
  toReEvaluate: { name: string; daysSince: number }[] = [];
  evalTrendData: EvalTrendPoint[] = [];
  objectiveStatusHasData = false; // unused — donut always renders (gray ring when empty)
  absenceTypeHasData = false;     // unused — donut always renders (gray ring when empty)

  teamMembers: TeamMemberSnapshot[] = [];
  objectives: ManagerObjective[] = [];
  absenceDashboard: AdvancedAbsenceDashboard | null = null;
  selectedPeriod: DashboardPeriod = 'month';

  constructor(
    private router: Router,
    private auth: AuthService,
    private managerService: ManagerService,
    private employeeService: EmployeeService,
    private attendanceService: AttendanceService,
    private evaluationService: EvaluationService,
    private managerOkrService: ManagerOkrService,
    private advancedAbsenceService: ManagerAdvancedAbsencesService
  ) {
    if (!AccueilManagerComponent.chartsRegistered) {
      Chart.register(...registerables);
      AccueilManagerComponent.chartsRegistered = true;
    }
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit(): void {
    this.loadDashboard();
  }

  ngAfterViewInit(): void {
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.stopLoadingGuard();
    this.destroyCharts();
  }

  onDeconnexion() {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil() { this.router.navigate(['/profil']); }

  get objectiveTone(): 'good' | 'warn' | 'bad' {
    return this.averageObjectiveAchievement >= 75 ? 'good' : this.averageObjectiveAchievement >= 55 ? 'warn' : 'bad';
  }

  get engagementTone(): 'good' | 'warn' | 'bad' {
    return this.averageEngagementScore >= 80 ? 'good' : this.averageEngagementScore >= 60 ? 'warn' : 'bad';
  }

  get evalTrendHasData(): boolean {
    return this.evalTrendData.length >= 2;
  }

  get presenceTone(): 'good' | 'warn' | 'bad' {
    return this.attendanceRateCurrent >= 90 ? 'good' : this.attendanceRateCurrent >= 75 ? 'warn' : 'bad';
  }

  get presenceDelta(): number {
    return this.round1(this.attendanceRateCurrent - this.attendanceRatePrevious);
  }

  get evalDelta(): number {
    return this.round1(this.averageEngagementScore - this.avgEvalPrevious);
  }

  onPeriodChange(period: DashboardPeriod): void {
    if (this.selectedPeriod === period) return;
    this.selectedPeriod = period;
    this.computePresenceKpi(this.allAttendances);
    this.renderCharts();
  }

  get periodRangeLabel(): string {
    const range = getCurrentRange(this.selectedPeriod);
    const fmt = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${fmt(range.start)} – ${fmt(range.end)}`;
  }

  exportExcel(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['Nom', 'Département', 'Présence %', 'Jours absents', 'Score évaluation', 'Dernière évaluation'];
      const rows = this.teamMembers.map(m => [
        m.name,
        m.department,
        m.attendanceRate,
        m.absencesDays,
        m.evaluationScore,
        m.latestEvalDate ?? ''
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tableau de bord');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `dashboard-manager-${today}.xlsx`);
    });
  }

  private loadDashboard(): void {
    const managerEmployeeId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (managerEmployeeId == null) {
      this.resetDashboard();
      return;
    }

    this.isLoading = true;
    this.startLoadingGuard();
    const today = new Date().toISOString().slice(0, 10);

    this.employeeService.getAllEmployees().pipe(
      map((employees) => (employees ?? []).filter((employee) => employee.managerId === managerEmployeeId)),
      switchMap((teamEmployees) => {
        if (!teamEmployees.length) {
          return of({
            teamEmployees,
            attendances: [] as Attendance[],
            evaluationsData: [] as EmployeeEvaluation[][],
            objectives: [] as ManagerObjective[],
            absenceDashboard: null as AdvancedAbsenceDashboard | null
          });
        }

        return forkJoin({
          attendances: this.attendanceService.getAll().pipe(catchError(() => of([]))),
          evaluationsData: forkJoin(
            teamEmployees.map((employee) =>
              this.evaluationService.listByEmployeeId(employee.employeeId).pipe(
                catchError(() => of([] as EmployeeEvaluation[]))
              )
            )
          ),
          objectives: this.managerOkrService.getDashboard(managerEmployeeId).pipe(
            map((dashboard) => dashboard.objectives ?? []),
            catchError(() => of([]))
          ),
          absenceDashboard: this.advancedAbsenceService
            .getDashboard(managerEmployeeId, 'monthly', today, 2)
            .pipe(catchError(() => of(null)))
        }).pipe(map((data) => ({ teamEmployees, ...data })));
      })
    ).subscribe({
      next: ({ teamEmployees, attendances, evaluationsData, objectives, absenceDashboard }) => {
        this.allAttendances = attendances;
        const evaluationScores = (evaluationsData as EmployeeEvaluation[][]).map(rows => this.extractLatestEvaluationScore(rows));
        this.teamMembers = this.buildTeamSnapshots(teamEmployees, attendances, evaluationScores, evaluationsData as EmployeeEvaluation[][]);
        this.objectives = objectives;
        this.absenceDashboard = absenceDashboard;
        this.computeKpis();
        this.computePresenceKpi(attendances);
        this.computeBradfordDistribution(attendances);
        this.computeEvalExtras(evaluationsData as EmployeeEvaluation[][]);
        // Both donut charts always render (empty state shown as gray ring)
        this.isLoading = false;
        this.stopLoadingGuard();
        setTimeout(() => this.renderCharts());
      },
      error: () => {
        this.resetDashboard();
      }
    });
  }

  private buildTeamSnapshots(
    teamEmployees: Employee[],
    attendances: Attendance[],
    evaluationScores: number[],
    evaluationsData: EmployeeEvaluation[][]
  ): TeamMemberSnapshot[] {
    const rowsByEmployee = new Map<number, Attendance[]>();
    for (const row of attendances) {
      if (!rowsByEmployee.has(row.employeeId)) rowsByEmployee.set(row.employeeId, []);
      rowsByEmployee.get(row.employeeId)!.push(row);
    }

    return teamEmployees.map((employee, index) => {
      const dailyRows = rowsByEmployee.get(employee.employeeId) ?? [];
      const totalDays = dailyRows.length;
      const presentDays = dailyRows.filter(r => r.isPresent).length;
      const absentDays = totalDays - presentDays;
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : 0;
      const evalScore = evaluationScores[index] ?? 0;
      const evals = evaluationsData[index] ?? [];
      const latestEval = [...evals].sort((a, b) =>
        new Date(b.evaluatedAt ?? '').getTime() - new Date(a.evaluatedAt ?? '').getTime()
      )[0];

      return {
        employeeId: employee.employeeId,
        name: `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || `collaborateur #${employee.employeeId}`,
        department: employee.departmentName || 'N/A',
        attendanceRate,
        absencesDays: absentDays,
        evaluationScore: this.normalizeToHundred(evalScore),
        latestEvalDate: latestEval?.evaluatedAt ?? null
      };
    });
  }

  private extractLatestEvaluationScore(rows: EmployeeEvaluation[]): number {
    const sorted = [...(rows ?? [])].sort((a, b) => {
      const d1 = new Date(a.evaluatedAt ?? '').getTime();
      const d2 = new Date(b.evaluatedAt ?? '').getTime();
      return d2 - d1;
    });
    const latest = sorted[0]?.rating;
    return typeof latest === 'number' ? latest : 0;
  }

  private computeKpis(): void {
    this.teamSize = this.teamMembers.length;
    this.activeMembersCount = this.teamMembers.filter((member) => member.attendanceRate >= 70).length;

    if (this.objectives.length) {
      const weightedProgress = this.objectives.reduce(
        (sum, objective) => sum + (objective.progressPercent * objective.weighting),
        0
      );
      const totalWeight = this.objectives.reduce((sum, objective) => sum + objective.weighting, 0);
      this.averageObjectiveAchievement = totalWeight > 0 ? this.round1(weightedProgress / totalWeight) : 0;
    } else {
      this.averageObjectiveAchievement = this.round1(this.average(this.teamMembers.map((member) => member.evaluationScore)));
    }

    const scoredMembers = this.teamMembers.filter(m => m.evaluationScore > 0);
    this.averageEngagementScore = scoredMembers.length > 0
      ? this.round1(this.average(scoredMembers.map(m => m.evaluationScore)))
      : 0;
  }

  private computePresenceKpi(attendances: Attendance[]): void {
    const currentRange = getCurrentRange(this.selectedPeriod);
    const previousRange = getPreviousRange(this.selectedPeriod);
    const teamIds = new Set(this.teamMembers.map(m => m.employeeId));
    const isWorkday = (dateStr: string) => { const d = new Date(dateStr); return d.getDay() !== 0 && d.getDay() !== 6; };

    const curRows = attendances.filter(r => {
      if (!r.attendanceDate || !teamIds.has(r.employeeId) || !isWorkday(r.attendanceDate)) return false;
      return isDateInRange(r.attendanceDate, currentRange);
    });
    const prevRows = attendances.filter(r => {
      if (!r.attendanceDate || !teamIds.has(r.employeeId) || !isWorkday(r.attendanceDate)) return false;
      return isDateInRange(r.attendanceDate, previousRange);
    });

    this.attendanceRateCurrent = curRows.length > 0
      ? this.round1(curRows.filter(r => r.isPresent).length / curRows.length * 100)
      : 0;
    this.attendanceRatePrevious = prevRows.length > 0
      ? this.round1(prevRows.filter(r => r.isPresent).length / prevRows.length * 100)
      : 0;
  }

  private computeBradfordDistribution(attendances: Attendance[]): void {
    const teamIds = new Set(this.teamMembers.map(m => m.employeeId));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 364);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const levels: BradfordLevel[] = [
      { label: 'Faible',   color: '#16a34a', count: 0, pct: 0 },
      { label: 'Modéré',   color: '#d97706', count: 0, pct: 0 },
      { label: 'Élevé',    color: '#ea580c', count: 0, pct: 0 },
      { label: 'Critique', color: '#dc2626', count: 0, pct: 0 }
    ];

    for (const memberId of teamIds) {
      const rows = attendances
        .filter(r => r.employeeId === memberId && !r.isPresent && (r.attendanceDate ?? '') >= cutoffStr)
        .sort((a, b) => (a.attendanceDate ?? '').localeCompare(b.attendanceDate ?? ''));

      let occurrences = 0;
      let prevDate: Date | null = null;
      for (const row of rows) {
        const d = new Date(row.attendanceDate ?? '');
        if (!prevDate || (d.getTime() - prevDate.getTime()) > 3 * 24 * 60 * 60 * 1000) occurrences++;
        prevDate = d;
      }
      const totalDays = rows.length;
      const score = occurrences * occurrences * totalDays;
      if      (score >= 400) levels[3].count++;
      else if (score >= 175) levels[2].count++;
      else if (score >= 50)  levels[1].count++;
      else                   levels[0].count++;
    }

    const total = Math.max(1, Array.from(teamIds).length);
    levels.forEach(l => l.pct = Math.round(l.count / total * 100));
    this.bradfordDistribution = levels;
  }

  private computeEvalExtras(evaluationsData: EmployeeEvaluation[][]): void {
    const allEvals = evaluationsData.flat();

    // Eval trend by quarter — only past or current quarters, normalized to /100
    const now = new Date();
    const currentQuarterKey = `T${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    const quarterMap = new Map<string, number[]>();
    for (const ev of allEvals) {
      if (!ev.evaluatedAt || ev.rating == null) continue;
      const d = new Date(ev.evaluatedAt);
      if (isNaN(d.getTime()) || d > now) continue;
      const q = Math.floor(d.getMonth() / 3) + 1;
      const key = `T${q} ${d.getFullYear()}`;
      if (!quarterMap.has(key)) quarterMap.set(key, []);
      quarterMap.get(key)!.push(this.normalizeToHundred(ev.rating));
    }
    this.evalTrendData = Array.from(quarterMap.entries())
      .sort((a, b) => {
        const [qa, ya] = a[0].split(' '); const [qb, yb] = b[0].split(' ');
        return (+ya - +yb) || qa.localeCompare(qb);
      })
      .slice(-6)
      .map(([label, ratings]) => ({ label, avg: this.round1(ratings.reduce((s, v) => s + v, 0) / ratings.length) }));

    // Previous campaign average
    this.avgEvalPrevious = this.evalTrendData.length >= 2
      ? this.evalTrendData[this.evalTrendData.length - 2].avg
      : 0;

    // Top evaluated — only members with a real evaluation
    this.topEvaluated = [...this.teamMembers]
      .filter(m => m.evaluationScore > 0 && m.latestEvalDate !== null)
      .sort((a, b) => b.evaluationScore - a.evaluationScore)
      .slice(0, 4)
      .map(m => ({ name: m.name, score: m.evaluationScore }));

    // To re-evaluate (no eval in last 90 days)
    this.toReEvaluate = this.teamMembers
      .filter(m => {
        if (!m.latestEvalDate) return true;
        const d = new Date(m.latestEvalDate);
        return !isNaN(d.getTime()) && (now.getTime() - d.getTime()) > 90 * 24 * 60 * 60 * 1000;
      })
      .slice(0, 4)
      .map(m => ({
        name: m.name,
        daysSince: m.latestEvalDate
          ? Math.floor((now.getTime() - new Date(m.latestEvalDate).getTime()) / 86400000)
          : 999
      }));
  }

  private renderCharts(): void {
    this.destroyCharts();
    this.renderObjectiveByDepartmentChart();
    this.renderObjectiveStatusChart();
    this.renderAbsenceTrend6MonthsChart();
    this.renderAbsenceTypeChart();
    this.renderRadarTeam();
    this.renderBradfordChart();
    this.renderEvalDist();
    this.renderEvalTrend();
  }

  private renderObjectiveByDepartmentChart(): void {
    if (!this.objectiveProgressCanvas) return;
    // Group objectives by owner's department
    const deptMap = new Map<string, ManagerObjective[]>();
    for (const obj of this.objectives) {
      const member = this.teamMembers.find(
        m => m.name.trim().toLowerCase() === (obj.ownerName ?? '').trim().toLowerCase()
      );
      const dept = member?.department ?? obj.teamName ?? 'N/A';
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      deptMap.get(dept)!.push(obj);
    }
    if (!deptMap.size) return;

    const rows = Array.from(deptMap.entries())
      .map(([dept, objs]) => {
        const totalW = objs.reduce((s, o) => s + o.weighting, 0);
        const value = totalW > 0
          ? this.round1(objs.reduce((s, o) => s + o.progressPercent * o.weighting, 0) / totalW)
          : 0;
        return { dept, value };
      })
      .sort((a, b) => a.dept.localeCompare(b.dept));

    this.chartInstances.push(new Chart(this.objectiveProgressCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: rows.map(r => r.dept),
        datasets: [{
          data: rows.map(r => r.value),
          backgroundColor: rows.map(r => this.performanceColor(r.value, 75, 50)),
          borderRadius: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b' } },
          y: { beginAtZero: true, max: 100, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: (v: any) => v + '%' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.label}: ${ctx.raw}%` } }
        }
      }
    }));
  }

  private renderObjectiveStatusChart(): void {
    if (!this.objectiveStatusCanvas) return;
    const achieved = this.objectives.filter((o) => o.riskStatus === 'ON_TRACK').length;
    const atRisk   = this.objectives.filter((o) => o.riskStatus === 'AT_RISK').length;
    const delayed  = this.objectives.filter((o) => o.riskStatus === 'OFF_TRACK').length;
    const total    = achieved + atRisk + delayed;
    const isEmpty  = total === 0;
    this.chartInstances.push(new Chart(this.objectiveStatusCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels:   isEmpty ? ['Aucun objectif'] : ['On track', 'À risque', 'En retard'],
        datasets: [{
          data:            isEmpty ? [1] : [achieved, atRisk, delayed],
          backgroundColor: isEmpty ? ['#e2e8f0'] : ['#16a34a', '#f59e0b', '#dc2626'],
          borderColor: '#ffffff',
          borderWidth: isEmpty ? 0 : 2
        }]
      },
      options: isEmpty
        ? { cutout: '64%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10 } }, tooltip: { enabled: false } } }
        : this.baseDonutOptions((ctx, t) =>
            `${ctx.label}: ${ctx.raw} (${t > 0 ? this.round1((Number(ctx.raw) / t) * 100) : 0}%)`)
    }));
  }

  private renderAbsenceTrend6MonthsChart(): void {
    if (!this.absenceTrendCanvas) return;
    const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const now = new Date();
    const labels: string[] = [];
    const absRates: number[] = [];
    const lateRates: number[] = [];
    const teamIds = new Set(this.teamMembers.map(m => m.employeeId));

    for (let i = 5; i >= 0; i--) {
      const offset = now.getMonth() - i;
      const y = offset < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = ((offset) + 12) % 12;
      labels.push(MONTHS[m]);
      const monthRows = this.allAttendances.filter(r => {
        if (!r.attendanceDate || !teamIds.has(r.employeeId)) return false;
        const d = new Date(r.attendanceDate);
        return d.getFullYear() === y && d.getMonth() === m && d.getDay() !== 0 && d.getDay() !== 6;
      });
      absRates.push(monthRows.length > 0
        ? this.round1(monthRows.filter(r => !r.isPresent).length / monthRows.length * 100) : 0);
      lateRates.push(monthRows.length > 0
        ? this.round1(monthRows.filter(r => r.isLate).length / monthRows.length * 100) : 0);
    }

    this.chartInstances.push(new Chart(this.absenceTrendCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Taux absence %',
            data: absRates,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,0.07)',
            borderWidth: 2, tension: 0.38,
            pointRadius: 4, pointBackgroundColor: '#2563eb', fill: true
          },
          {
            label: 'Retards %',
            data: lateRates,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249,115,22,0.06)',
            borderWidth: 2, tension: 0.38,
            pointRadius: 3, pointBackgroundColor: '#f97316', fill: true
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: (v: any) => v + '%' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw}%` } }
        }
      }
    }));
  }

  private renderAbsenceTypeChart(): void {
    if (!this.absenceTypeCanvas) return;
    const counts = { maladie: 0, personnel: 0, conge: 0 };
    (this.absenceDashboard?.calendarAbsences ?? []).forEach((absence) => {
      if (absence.absenceType === 'maladie') counts.maladie += 1;
      else if (absence.absenceType === 'conge-paye') counts.conge += 1;
      else counts.personnel += 1;
    });
    const total   = counts.maladie + counts.personnel + counts.conge;
    const isEmpty = total === 0;
    this.chartInstances.push(new Chart(this.absenceTypeCanvas.nativeElement, {
      type: 'doughnut',
      data: {
        labels:   isEmpty ? ['Aucune absence'] : ['Maladie', 'Autres absences', 'Congé payé'],
        datasets: [{
          data:            isEmpty ? [1] : [counts.maladie, counts.personnel, counts.conge],
          backgroundColor: isEmpty ? ['#e2e8f0'] : ['#0ea5e9', '#f59e0b', '#22c55e'],
          borderColor: '#ffffff',
          borderWidth: isEmpty ? 0 : 2
        }]
      },
      options: isEmpty
        ? { cutout: '64%', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10 } }, tooltip: { enabled: false } } }
        : this.baseDonutOptions((ctx, t) =>
            `${ctx.label}: ${ctx.raw} (${t > 0 ? this.round1((Number(ctx.raw) / t) * 100) : 0}%)`)
    }));
  }

  private renderRadarTeam(): void {
    if (!this.radarTeamCanvas) return;
    const teamIds = new Set(this.teamMembers.map(m => m.employeeId));
    const workingRows = this.allAttendances.filter(r => {
      if (!r.attendanceDate || !teamIds.has(r.employeeId)) return false;
      const dow = new Date(r.attendanceDate).getDay();
      return dow !== 0 && dow !== 6;
    });
    const presentRows = workingRows.filter(r => r.isPresent);
    const presence     = workingRows.length > 0 ? this.round1(presentRows.length / workingRows.length * 100) : 0;
    const ponctualite  = presentRows.length  > 0 ? this.round1(presentRows.filter(r => !r.isLate).length / presentRows.length * 100) : 0;
    const objectifs    = this.averageObjectiveAchievement;
    const evaluation   = this.averageEngagementScore; // already 0–100

    this.chartInstances.push(new Chart(this.radarTeamCanvas.nativeElement, {
      type: 'radar',
      data: {
        labels: ['Présence', 'Ponctualité', 'Objectifs', 'Évaluation'],
        datasets: [
          {
            label: 'Équipe',
            data: [presence, ponctualite, objectifs, evaluation],
            backgroundColor: 'rgba(37,99,235,0.10)',
            borderColor: '#2563eb',
            pointBackgroundColor: '#2563eb',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5, pointRadius: 3
          },
          {
            label: 'Référence',
            data: [90, 85, 80, 80],
            backgroundColor: 'transparent',
            borderColor: 'rgba(100,116,139,0.35)',
            borderDash: [5, 4],
            pointRadius: 0, borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, color: '#94a3b8', backdropColor: 'transparent', font: { size: 9 } },
            grid: { color: 'rgba(0,0,0,0.07)' },
            angleLines: { color: 'rgba(0,0,0,0.07)' },
            pointLabels: { color: '#475569', font: { size: 10 } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw}%` } }
        }
      }
    }));
  }

  private renderBradfordChart(): void {
    if (!this.bradfordCanvas || !this.bradfordDistribution.length) return;
    this.chartInstances.push(new Chart(this.bradfordCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels: this.bradfordDistribution.map(l => l.label),
        datasets: [{
          data: this.bradfordDistribution.map(l => l.count),
          backgroundColor: this.bradfordDistribution.map(l => l.color),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { color: '#64748b', font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.04)' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.raw} membre${ctx.raw !== 1 ? 's' : ''}` } }
        }
      }
    }));
  }

  private renderEvalDist(): void {
    if (!this.evalDistCanvas) return;
    const bins = [0, 0, 0, 0, 0, 0]; // <40, 40-60, 60-70, 70-80, 80-90, ≥90
    for (const m of this.teamMembers) {
      const s = m.evaluationScore;
      if (s <= 0) continue;
      if      (s < 40) bins[0]++;
      else if (s < 60) bins[1]++;
      else if (s < 70) bins[2]++;
      else if (s < 80) bins[3]++;
      else if (s < 90) bins[4]++;
      else             bins[5]++;
    }
    const labels = ['< 40', '40–60', '60–70', '70–80', '80–90', '≥ 90'];
    this.chartInstances.push(new Chart(this.evalDistCanvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'À risque < 60',
            data: [bins[0], bins[1], 0, 0, 0, 0],
            backgroundColor: '#dc2626',
            borderRadius: 4, borderSkipped: false
          },
          {
            label: 'Bien 60–80',
            data: [0, 0, bins[2], bins[3], 0, 0],
            backgroundColor: '#f59e0b',
            borderRadius: 4, borderSkipped: false
          },
          {
            label: 'Excellent ≥ 80',
            data: [0, 0, 0, 0, bins[4], bins[5]],
            backgroundColor: '#16a34a',
            borderRadius: 4, borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 30 } },
          y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } }
        },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { color: '#64748b', boxWidth: 10, font: { size: 10 } } },
          tooltip: {
            filter: (item: any) => (item.raw as number) > 0,
            callbacks: {
              title: () => '',
              label: (ctx: any) => `${ctx.raw} membre${(ctx.raw as number) !== 1 ? 's' : ''}`
            }
          }
        }
      }
    }));
  }

  private renderEvalTrend(): void {
    if (!this.evalTrendCanvas || !this.evalTrendHasData) return;
    this.chartInstances.push(new Chart(this.evalTrendCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: this.evalTrendData.map(d => d.label),
        datasets: [{
          label: 'Score moyen équipe',
          data: this.evalTrendData.map(d => d.avg),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.07)',
          borderWidth: 2, tension: 0.35,
          pointRadius: 4, pointBackgroundColor: '#2563eb',
          pointBorderColor: '#fff', pointBorderWidth: 1.5, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#64748b', font: { size: 10 }, stepSize: 20, callback: (v: any) => v + '/100' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => `Score moyen: ${ctx.raw}/100` } }
        }
      }
    }));
  }

  private baseBarOptions(horizontal: boolean, tooltipLabel: (ctx: any) => string): any {
    return {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          max: horizontal ? 100 : undefined,
          grid: { color: '#e2e8f0' },
          ticks: { color: '#64748b' }
        },
        y: {
          beginAtZero: true,
          grid: { color: horizontal ? 'transparent' : '#e2e8f0' },
          ticks: { color: '#64748b' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: any) => tooltipLabel(ctx) } }
      }
    };
  }

  private baseLineOptions(tooltipLabel: (ctx: any) => string): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } },
        y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: any) => tooltipLabel(ctx) } }
      }
    };
  }

  private baseDonutOptions(tooltipLabel: (ctx: any, total: number) => string): any {
    return {
      cutout: '64%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' as const, labels: { color: '#64748b', boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const values = ctx.dataset.data as number[];
              const total = values.reduce((sum, value) => sum + Number(value), 0);
              return tooltipLabel(ctx, total);
            }
          }
        }
      }
    };
  }

  private destroyCharts(): void {
    this.chartInstances.forEach((chart) => chart.destroy());
    this.chartInstances.length = 0;
  }

  private performanceColor(value: number, good: number, warn: number): string {
    if (value >= good) return '#16a34a';
    if (value >= warn) return '#f59e0b';
    return '#dc2626';
  }

  private clampRate(value: number | null | undefined): number {
    const numberValue = Number(value ?? 0);
    if (!Number.isFinite(numberValue)) return 0;
    return this.clamp(numberValue, 0, 100);
  }

  private normalizeToHundred(value: number): number {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (v <= 5)  return this.round1(v * 20);   // /5  → /100
    if (v <= 10) return this.round1(v * 10);   // /10 → /100
    return this.round1(this.clamp(v, 0, 100)); // already /100
  }

  private nonNegative(value: number | null | undefined): number {
    const numberValue = Number(value ?? 0);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.max(0, numberValue);
  }

  private average(values: number[]): number {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private resetDashboard(): void {
    this.stopLoadingGuard();
    this.isLoading = false;
    this.teamMembers = [];
    this.objectives = [];
    this.absenceDashboard = null;
    this.activeMembersCount = 0;
    this.teamSize = 0;
    this.averageObjectiveAchievement = 0;
    this.averageEngagementScore = 0;
    this.attendanceRateCurrent = 0;
    this.attendanceRatePrevious = 0;
    this.avgEvalPrevious = 0;
    this.bradfordDistribution = [];
    this.topEvaluated = [];
    this.toReEvaluate = [];
    this.evalTrendData = [];
    this.renderCharts();
  }

  private startLoadingGuard(): void {
    this.stopLoadingGuard();
    this.loadingGuardTimer = setTimeout(() => {
      this.isLoading = false;
      this.loadingGuardTimer = undefined;
    }, 10000);
  }

  private stopLoadingGuard(): void {
    if (!this.loadingGuardTimer) return;
    clearTimeout(this.loadingGuardTimer);
    this.loadingGuardTimer = undefined;
  }
}