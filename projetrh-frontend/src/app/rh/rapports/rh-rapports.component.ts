import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService, Utilisateur } from '../../services/auth';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Department, DepartmentService } from '../../services/department.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import { ToastService } from '../../components/toast/toast.service';

type PeriodType = 'month' | 'quarter' | 'semester' | 'year' | 'custom';

interface RhReportType {
  id: 'social' | 'health';
  title: string;
  description: string;
  icon: 'social' | 'health';
}

interface ReportKpi {
  label: string;
  value: string;
}

@Component({
  selector: 'app-rh-rapports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './rh-rapports.component.html',
  styleUrl: './rh-rapports.component.scss'
})
export class RhRapportsComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly departmentService = inject(DepartmentService);
  private readonly toast = inject(ToastService);

  utilisateur: Utilisateur | null;
  showPreviewModal = false;
  previewKpis: ReportKpi[] = [];
  previewRows: string[][] = [];
  isLoading = false;

  reports: RhReportType[] = [
    {
      id: 'social',
      title: 'Bilan social (effectif)',
      description: 'Effectif total et répartition par département',
      icon: 'social'
    },
    {
      id: 'health',
      title: 'Absentéisme & santé',
      description: 'Taux d\'absentéisme et analyse des présences',
      icon: 'health'
    }
  ];

  selectedReport: RhReportType = this.reports[0];
  selectedPeriod: PeriodType = 'semester';
  todayStr = this.toIso(new Date());
  startDate = this.toIso(this.subtractMonths(new Date(), 6));
  endDate = this.todayStr;
  department = "Toute l'entreprise";
  departments: Department[] = [];

  constructor(private router: Router, private auth: AuthService) {
    this.utilisateur = this.auth.utilisateur;
    if (!this.utilisateur) {
      this.router.navigate(['/login']);
    }
  }

  ngOnInit(): void {
    this.departmentService.getAllDepartments().pipe(catchError(() => of([]))).subscribe((depts) => {
      this.departments = depts ?? [];
    });
  }

  selectReport(report: RhReportType): void {
    this.selectedReport = report;
  }

  selectPeriod(period: PeriodType): void {
    this.selectedPeriod = period;
    const today = new Date();
    this.endDate = this.toIso(today);
    switch (period) {
      case 'month':
        this.startDate = this.toIso(this.subtractMonths(today, 1));
        break;
      case 'quarter':
        this.startDate = this.toIso(this.subtractMonths(today, 3));
        break;
      case 'semester':
        this.startDate = this.toIso(this.subtractMonths(today, 6));
        break;
      case 'year':
        this.startDate = this.toIso(this.subtractMonths(today, 12));
        break;
    }
  }

  onStartDateChange(): void {
    if (this.startDate > this.endDate) this.startDate = this.endDate;
    this.selectedPeriod = 'custom';
  }

  onEndDateChange(): void {
    if (this.endDate > this.todayStr) this.endDate = this.todayStr;
    if (this.startDate > this.endDate) this.startDate = this.endDate;
    this.selectedPeriod = 'custom';
  }

  formatFr(ymd: string): string {
    if (!ymd) return '—';
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  openPreview(): void {
    this.isLoading = true;
    this.buildPreview().subscribe({
      next: (data) => {
        this.isLoading = false;
        if (!data.rows.length || data.rows.length <= 1) {
          this.toast.error('Aucune donnée pour cette période.');
          return;
        }
        this.previewKpis = data.kpis;
        this.previewRows = data.rows;
        this.showPreviewModal = true;
      },
      error: () => {
        this.isLoading = false;
        this.toast.error('Impossible de charger les données.');
      }
    });
  }

  closePreview(): void {
    this.showPreviewModal = false;
  }

  export(format: 'pdf' | 'excel'): void {
    this.buildPreview().subscribe({
      next: (data) => {
        if (!data.rows.length || data.rows.length <= 1) {
          this.toast.error('Aucune donnée pour cette période.');
          return;
        }
        if (format === 'excel') {
          import('xlsx/xlsx.mjs').then((XLSX) => {
            const ws = XLSX.utils.aoa_to_sheet(data.rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Rapport');
            XLSX.writeFile(wb, `rapport_rh_${this.selectedReport.id}_${this.startDate}.xlsx`);
          });
          return;
        }
        const lines = [
          this.selectedReport.title,
          `Période: ${this.formatFr(this.startDate)} - ${this.formatFr(this.endDate)}`,
          '',
          ...data.kpis.map(k => `${k.label}: ${k.value}`),
          '',
          ...data.rows.map(r => r.join(' | '))
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport_rh_${this.selectedReport.id}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  private buildPreview() {
    return forkJoin({
      employees: this.employeeService.getAllEmployees().pipe(catchError(() => of([] as Employee[]))),
      departments: this.departmentService.getAllDepartments().pipe(catchError(() => of([] as Department[]))),
      attendances: this.attendanceService.getAll().pipe(catchError(() => of([] as Attendance[])))
    }).pipe(
      map(({ employees, departments, attendances }) =>
        this.buildPreviewSync(employees ?? [], departments ?? [], attendances ?? [])
      ),
      catchError(() => of({ kpis: [], rows: [] as string[][] }))
    );
  }

  private buildPreviewSync(employees: Employee[], departments: Department[], attendances: Attendance[]) {
    const filteredEmployees = this.department === "Toute l'entreprise"
      ? employees
      : employees.filter(e => e.departmentName === this.department);

    if (this.selectedReport.id === 'social') {
      const byDept = departments.map(d => {
        const count = employees.filter(e => e.departmentId === d.departmentId).length;
        return [d.departmentName, String(count)];
      }).filter(r => r[1] !== '0');
      return {
        kpis: [
          { label: 'Effectif total', value: String(employees.length) },
          { label: 'Départements actifs', value: String(byDept.length) }
        ],
        rows: [['Département', 'Effectif'], ...byDept]
      };
    }

    const teamAtt = attendances.filter(a =>
      a.attendanceDate &&
      a.attendanceDate >= this.startDate &&
      a.attendanceDate <= this.endDate &&
      filteredEmployees.some(e => e.employeeId === a.employeeId)
    );
    const present = teamAtt.filter(a => a.isPresent).length;
    const rate = teamAtt.length ? Math.round((present / teamAtt.length) * 100) : 0;
    return {
      kpis: [
        { label: 'Enregistrements', value: String(teamAtt.length) },
        { label: 'Taux de présence', value: teamAtt.length ? `${rate}%` : '—' },
        { label: 'Absences', value: String(teamAtt.length - present) }
      ],
      rows: [['Indicateur', 'Valeur'], ['Présences', String(present)], ['Absences', String(teamAtt.length - present)], ['Taux', `${rate}%`]]
    };
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private subtractMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() - months);
    return d;
  }

  onNotifications(): void {}
  onDeconnexion(): void { this.auth.deconnexion(); this.router.navigate(['/login']); }
  onProfil(): void { this.router.navigate(['/profil']); }
}
