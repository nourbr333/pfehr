import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import { EmployeeEvaluation, EvaluationService } from '../../services/evaluation.service';
import { ManagerService } from '../../services/manager.service';
import { ToastService } from '../../components/toast/toast.service';

export interface ReportType {
  id: 'performance' | 'presence' | 'resume';
  title: string;
  description: string;
  icon: 'trend' | 'calendar' | 'summary';
}

export interface ReportKpi {
  label: string;
  value: string;
}

type PeriodPreset = 'week' | 'month' | 'quarter' | 'year';

interface PreviewData {
  kpis: ReportKpi[];
  rows: string[][];
}

@Component({
  selector: 'app-rapport',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rapport.component.html',
  styleUrl: './rapport.component.scss'
})
export class RapportComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly managerService = inject(ManagerService);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly evaluationService = inject(EvaluationService);
  private readonly toast = inject(ToastService);

  reportTypes: ReportType[] = [
    {
      id: 'presence',
      title: "Rapport de présence et d'absentéisme",
      description: "Vue d'ensemble des présences, absences et congés",
      icon: 'calendar'
    },
    {
      id: 'performance',
      title: "Rapport de performance d'équipe",
      description: 'Analyse des performances et tendances d\'évaluation',
      icon: 'trend'
    },
    {
      id: 'resume',
      title: 'Résumé global de l\'équipe',
      description: 'Synthèse des indicateurs clés',
      icon: 'summary'
    }
  ];

  selectedTypeId: ReportType['id'] = 'presence';
  periodPreset: PeriodPreset = 'month';
  todayStr = this.toIso(new Date());
  startDate = this.toIso(this.subtractMonths(new Date(), 1));
  endDate = this.todayStr;

  teamSize = 0;
  isLoading = false;
  showPreviewModal = false;
  previewKpis: ReportKpi[] = [];
  previewRows: string[][] = [];

  ngOnInit(): void {
    this.loadTeamSize();
  }

  selectType(id: ReportType['id']) {
    this.selectedTypeId = id;
  }

  setPreset(p: PeriodPreset) {
    this.periodPreset = p;
    const today = new Date();
    this.endDate = this.toIso(today);
    switch (p) {
      case 'week':
        this.startDate = this.toIso(this.subtractDays(today, 7));
        break;
      case 'month':
        this.startDate = this.toIso(this.subtractMonths(today, 1));
        break;
      case 'quarter':
        this.startDate = this.toIso(this.subtractMonths(today, 3));
        break;
      case 'year':
        this.startDate = this.toIso(this.subtractMonths(today, 12));
        break;
    }
  }

  onStartDateChange(): void {
    if (this.startDate > this.endDate) this.startDate = this.endDate;
  }

  onEndDateChange(): void {
    if (this.endDate > this.todayStr) this.endDate = this.todayStr;
    if (this.startDate > this.endDate) this.startDate = this.endDate;
  }

  get selectedType(): ReportType {
    return this.reportTypes.find(t => t.id === this.selectedTypeId) ?? this.reportTypes[0];
  }

  formatFr(ymd: string): string {
    if (!ymd) return '—';
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  openPreview(): void {
    this.isLoading = true;
    this.buildPreviewData().subscribe({
      next: ({ kpis, rows }) => {
        this.isLoading = false;
        if (!rows.length || rows.length <= 1) {
          this.toast.error('Aucune donnée pour cette période.');
          return;
        }
        this.previewKpis = kpis;
        this.previewRows = rows;
        this.showPreviewModal = true;
      },
      error: () => {
        this.isLoading = false;
        this.toast.error('Impossible de charger les données du rapport.');
      }
    });
  }

  closePreview(): void {
    this.showPreviewModal = false;
  }

  export(format: 'pdf' | 'excel'): void {
    this.buildPreviewData().subscribe({
      next: ({ kpis, rows }) => {
        if (!rows.length || rows.length <= 1) {
          this.toast.error('Aucune donnée pour cette période.');
          return;
        }
        if (format === 'excel') {
          import('xlsx/xlsx.mjs').then((XLSX) => {
            const header = rows[0];
            const data = rows.slice(1);
            const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
            XLSX.writeFile(wb, `rapport_${this.selectedTypeId}_${this.startDate}_${this.endDate}.xlsx`);
          });
          return;
        }
        const lines = [
          this.selectedType.title,
          `Période: ${this.formatFr(this.startDate)} - ${this.formatFr(this.endDate)}`,
          '',
          ...kpis.map(k => `${k.label}: ${k.value}`),
          '',
          ...rows.map(r => r.join(' | '))
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport_${this.selectedTypeId}_${this.startDate}_${this.endDate}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });
  }

  private loadTeamSize(): void {
    const managerId = this.managerService.resolveManagerEmployeeId(this.auth.getCurrentUser());
    if (managerId == null) return;
    this.employeeService.getAllEmployees().pipe(catchError(() => of([]))).subscribe((employees) => {
      this.teamSize = (employees ?? []).filter(e => e.managerId === managerId).length;
    });
  }

  private buildPreviewData(): Observable<PreviewData> {
    const managerId = this.managerService.resolveManagerEmployeeId(this.auth.getCurrentUser());
    if (managerId == null) {
      return of({ kpis: [], rows: [] });
    }

    return forkJoin({
      employees: this.employeeService.getAllEmployees().pipe(catchError(() => of([] as Employee[]))),
      attendances: this.attendanceService.getAll().pipe(catchError(() => of([] as Attendance[])))
    }).pipe(
      switchMap(({ employees, attendances }) => {
        const team = (employees ?? []).filter(e => e.managerId === managerId);
        const teamIds = new Set(team.map(e => e.employeeId));
        const inPeriod = (attendances ?? []).filter(a =>
          teamIds.has(a.employeeId) &&
          a.attendanceDate &&
          a.attendanceDate >= this.startDate &&
          a.attendanceDate <= this.endDate
        );

        if (this.selectedTypeId === 'presence') {
          return of(this.buildPresencePreview(team, inPeriod));
        }

        const evalRequests = team.map(e =>
          this.evaluationService.listByEmployeeId(e.employeeId).pipe(catchError(() => of([])))
        );
        if (!evalRequests.length) {
          const empty = this.selectedTypeId === 'resume'
            ? this.buildResumePreview(team, inPeriod, [])
            : this.buildPerformancePreview(team, []);
          return of(empty);
        }
        return forkJoin(evalRequests).pipe(
          map((evalGroups) => {
            if (this.selectedTypeId === 'resume') {
              return this.buildResumePreview(team, inPeriod, evalGroups);
            }
            return this.buildPerformancePreview(team, evalGroups);
          })
        );
      }),
      catchError(() => of({ kpis: [], rows: [] }))
    );
  }

  private buildPresencePreview(team: Employee[], rows: Attendance[]): PreviewData {
    const present = rows.filter(r => r.isPresent).length;
    const rate = rows.length ? Math.round((present / rows.length) * 100) : 0;
    const absences = rows.length - present;
    const table: string[][] = [
      ['Collaborateur', 'Présences', 'Absences', 'Taux %'],
      ...team.map(member => {
        const memberRows = rows.filter(r => r.employeeId === member.employeeId);
        const p = memberRows.filter(r => r.isPresent).length;
        const a = memberRows.length - p;
        const pct = memberRows.length ? Math.round((p / memberRows.length) * 100) : 0;
        return [`${member.firstName} ${member.lastName}`, String(p), String(a), `${pct}%`];
      }).filter(r => r[1] !== '0' || r[2] !== '0')
    ];
    return {
      kpis: [
        { label: 'Effectif', value: String(team.length) },
        { label: 'Taux de présence', value: `${rate}%` },
        { label: 'Absences', value: String(absences) }
      ],
      rows: table
    };
  }

  private buildPerformancePreview(team: Employee[], evalGroups: EmployeeEvaluation[][]): PreviewData {
    const latestScores: number[] = [];
    const table: string[][] = [
      ['Collaborateur', 'Département', 'Dernière note'],
      ...team.map((member, idx) => {
        const evals = evalGroups[idx] ?? [];
        const latest = evals.length ? evals[0] : null;
        const rating = latest?.rating ?? null;
        if (rating != null) latestScores.push(rating);
        return [
          `${member.firstName} ${member.lastName}`,
          member.departmentName ?? '—',
          rating != null ? String(rating) : '—'
        ];
      })
    ];
    const avg = latestScores.length
      ? Math.round(latestScores.reduce((a, b) => a + b, 0) / latestScores.length)
      : 0;
    return {
      kpis: [
        { label: 'Effectif', value: String(team.length) },
        { label: 'Score moyen', value: avg ? `${avg}/100` : '—' },
        { label: 'Évaluations', value: String(latestScores.length) }
      ],
      rows: table
    };
  }

  private buildResumePreview(team: Employee[], attendances: Attendance[], evalGroups: EmployeeEvaluation[][]): PreviewData {
    const presence = this.buildPresencePreview(team, attendances);
    const performance = this.buildPerformancePreview(team, evalGroups);
    return {
      kpis: [...presence.kpis, ...performance.kpis.filter(k => k.label !== 'Effectif')],
      rows: [
        ['--- Présence ---'],
        ...presence.rows,
        ['--- Performance ---'],
        ...performance.rows
      ]
    };
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private subtractDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    return d;
  }

  private subtractMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() - months);
    return d;
  }
}
