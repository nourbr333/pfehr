import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { AdminService, RhOverview, RhMovement } from '../../services/admin.service';
import { ToastService } from '../../components/toast/toast.service';
import { EmployeeService } from '../../services/employee.service';
import { CongesRequestsComponent } from '../../rh/absences-conges/components/conges-requests/conges-requests.component';
import { LeaveBalanceComponent } from '../../rh/absences-conges/components/leave-balance/leave-balance.component';
import { LeaveRequestModalComponent } from '../../rh/absences-conges/components/leave-request-modal/leave-request-modal.component';
import { LeaveRequestService } from '../../rh/absences-conges/services/leave-request.service';
import { LeaveBalanceService } from '../../rh/absences-conges/services/leave-balance.service';
import { LeavePolicyService } from '../../rh/absences-conges/services/leave-policy.service';
import {
  EmployeeProfile,
  LeaveBalance,
  LeavePolicy,
  LeaveRequest,
  TypeColorMap
} from '../../rh/absences-conges/absences-conges.models';
import { AdminRhEmployeesPanelComponent } from './admin-rh-employees-panel/admin-rh-employees-panel.component';

let chartJsRegistered = false;

type RhTab = 'conges' | 'effectif' | 'performances';

@Component({
  selector: 'app-vue-responsables',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarAdminComponent,
    CongesRequestsComponent,
    LeaveBalanceComponent,
    LeaveRequestModalComponent,
    AdminRhEmployeesPanelComponent
  ],
  templateUrl: './vue-responsables.component.html',
  styleUrl: './vue-responsables.component.scss'
})
export class VueResponsablesComponent implements OnInit, OnDestroy {
  overview: RhOverview | null = null;
  loading = true;
  todayLabel = '';

  activeTab: RhTab = 'conges';

  readonly typeColors: TypeColorMap = {
    'conge-paye': { bg: '#dcfce7', text: '#166534', label: 'Congé payé' },
    'maladie': { bg: '#ffedd5', text: '#9a3412', label: 'Maladie' },
    'sans-solde': { bg: '#e5e7eb', text: '#374151', label: 'Sans solde' },
    'evenement-familial': { bg: '#ede9fe', text: '#5b21b6', label: 'Événement familial' },
    'autre': { bg: '#f3f4f6', text: '#4b5563', label: 'Autre' }
  };

  private readonly defaultLeavePolicies: LeavePolicy[] = [
    { id: 1, type: 'conge-paye', label: 'Congé payé annuel', maxDaysPerYear: 22, requiresDocument: false, color: '#2563eb', isActive: true },
    { id: 2, type: 'maladie', label: 'Congé maladie', maxDaysPerYear: 60, requiresDocument: true, color: '#f59e0b', isActive: true },
    { id: 3, type: 'sans-solde', label: 'Congé sans solde', maxDaysPerYear: 30, requiresDocument: false, color: '#6b7280', isActive: true },
    { id: 4, type: 'evenement-familial', label: 'Événement familial', maxDaysPerYear: 10, requiresDocument: true, color: '#8b5cf6', isActive: true },
    { id: 5, type: 'autre', label: 'Autre absence', maxDaysPerYear: 15, requiresDocument: false, color: '#9ca3af', isActive: true }
  ];

  congesLoading = true;
  employeeProfiles: EmployeeProfile[] = [];
  leaveRequests: LeaveRequest[] = [];
  leaveBalances: LeaveBalance[] = [];
  leavePolicies: LeavePolicy[] = this.defaultLeavePolicies;
  showNewRequestModal = false;

  rejectingMovementId: number | null = null;
  movementRejectReason = '';
  movementActionBusy = false;

  @ViewChild('leavesMonthlyCanvas') leavesMonthlyCanvas?: ElementRef<HTMLCanvasElement>;
  private leavesMonthlyChart: Chart | null = null;

  constructor(
    private admin: AdminService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private employeeService: EmployeeService,
    private leaveRequestService: LeaveRequestService,
    private leaveBalanceService: LeaveBalanceService,
    private leavePolicyService: LeavePolicyService
  ) {
    if (!chartJsRegistered) {
      Chart.register(...registerables);
      chartJsRegistered = true;
    }
  }

  ngOnInit(): void {
    this.refresh();
    this.loadCongesData();
  }

  ngOnDestroy(): void {
    this.leavesMonthlyChart?.destroy();
    this.leavesMonthlyChart = null;
  }

  get hasMonthlyChart(): boolean {
    return (this.overview?.demandesCongesParMois ?? []).some(m => m.total > 0);
  }

  setTab(tab: RhTab): void {
    this.activeTab = tab;
  }

  private refresh() {
    this.loading = true;
    this.admin.getRhOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.loading = false;
        this.todayLabel = new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
        this.scheduleChart();
      },
      error: () => {
        this.loading = false;
        this.toast.error('Impossible de charger la vue Responsables');
      }
    });
  }

  // ── Onglet Congés ──────────────────────────────────────────────────────

  private loadCongesData(): void {
    this.congesLoading = true;
    forkJoin({
      employees: this.employeeService.getAllEmployees().pipe(catchError(() => of([]))),
      leaveRequests: this.leaveRequestService.getAll().pipe(catchError(() => of([] as LeaveRequest[]))),
      leaveBalances: this.leaveBalanceService.getAll().pipe(catchError(() => of([] as LeaveBalance[]))),
      leavePolicies: this.leavePolicyService.getAll().pipe(catchError(() => of(this.defaultLeavePolicies)))
    }).subscribe(({ employees, leaveRequests, leaveBalances, leavePolicies }) => {
      this.employeeProfiles = employees.map((e) => ({
        id: e.employeeId,
        fullName: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
        avatar: `${e.firstName?.[0] ?? ''}${e.lastName?.[0] ?? ''}`.toUpperCase() || '??',
        department: e.departmentName || 'N/A',
        jobTitle: e.jobTitle || ''
      }));
      this.leaveRequests = leaveRequests.map((r) => ({
        ...r,
        employeeName: this.employeeProfiles.find((p) => p.id === r.employeeId)?.fullName || r.employeeName,
        employeeAvatar: this.employeeProfiles.find((p) => p.id === r.employeeId)?.avatar || r.employeeAvatar,
        department: this.employeeProfiles.find((p) => p.id === r.employeeId)?.department || r.department
      }));
      this.leaveBalances = leaveBalances;
      this.leavePolicies = leavePolicies.length ? leavePolicies : this.defaultLeavePolicies;
      this.congesLoading = false;
    });
  }

  onRequestApproved(event: { id: number }): void {
    this.leaveRequestService.updateStatus(event.id, 'approved').subscribe({
      next: () => {
        this.toast.success('Demande approuvée.');
        this.loadCongesData();
        this.refresh();
      },
      error: () => this.toast.error('Impossible d\u2019approuver cette demande.')
    });
  }

  onRequestRejected(event: { id: number; reason?: string }): void {
    this.leaveRequestService.updateStatus(event.id, 'rejected', event.reason).subscribe({
      next: () => {
        this.toast.success('Demande refusée.');
        this.loadCongesData();
        this.refresh();
      },
      error: () => this.toast.error('Impossible de refuser cette demande.')
    });
  }

  onRequestCancelled(event: { id: number }): void {
    this.leaveRequestService.updateStatus(event.id, 'cancelled').subscribe({
      next: () => {
        this.toast.success('Demande annulée.');
        this.loadCongesData();
        this.refresh();
      },
      error: () => this.toast.error('Impossible d\u2019annuler cette demande.')
    });
  }

  openNewRequestModal(): void {
    this.showNewRequestModal = true;
  }

  onNewRequestSubmitted(request: LeaveRequest): void {
    this.showNewRequestModal = false;
    this.toast.success('Demande de congé créée avec succès.');
    this.leaveRequests = [request, ...this.leaveRequests];
    this.loadCongesData();
    this.refresh();
  }

  onNewRequestClosed(): void {
    this.showNewRequestModal = false;
  }

  // ── Actions inline sur "Derniers mouvements" ──────────────────────────

  approveMovement(movement: RhMovement): void {
    if (this.movementActionBusy) return;
    this.movementActionBusy = true;
    this.leaveRequestService.updateStatus(movement.id, 'approved').subscribe({
      next: () => {
        this.movementActionBusy = false;
        this.toast.success('Demande approuvée.');
        this.refresh();
        this.loadCongesData();
      },
      error: () => {
        this.movementActionBusy = false;
        this.toast.error('Impossible d\u2019approuver cette demande.');
      }
    });
  }

  showRejectMovementInput(movement: RhMovement): void {
    this.rejectingMovementId = movement.id;
    this.movementRejectReason = '';
  }

  cancelRejectMovement(): void {
    this.rejectingMovementId = null;
    this.movementRejectReason = '';
  }

  confirmRejectMovement(movement: RhMovement): void {
    if (this.movementActionBusy || !this.movementRejectReason.trim()) return;
    this.movementActionBusy = true;
    this.leaveRequestService.updateStatus(movement.id, 'rejected', this.movementRejectReason.trim()).subscribe({
      next: () => {
        this.movementActionBusy = false;
        this.rejectingMovementId = null;
        this.toast.success('Demande refusée.');
        this.refresh();
        this.loadCongesData();
      },
      error: () => {
        this.movementActionBusy = false;
        this.toast.error('Impossible de refuser cette demande.');
      }
    });
  }

  // ── Graphique ──────────────────────────────────────────────────────────

  private scheduleChart(): void {
    this.leavesMonthlyChart?.destroy();
    this.leavesMonthlyChart = null;
    this.cdr.detectChanges();
    queueMicrotask(() => this.renderMonthlyChart());
  }

  private renderMonthlyChart(): void {
    const el = this.leavesMonthlyCanvas?.nativeElement;
    if (!el || !this.overview || !this.hasMonthlyChart) return;

    const months = this.overview.demandesCongesParMois;
    this.leavesMonthlyChart = new Chart(el, {
      type: 'line',
      data: {
        labels: months.map(m => m.mois),
        datasets: [
          {
            label: 'Demandes de congés',
            data: months.map(m => m.total),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: '#e2e8f0' },
            ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e2e8f0' },
            ticks: { color: '#64748b', precision: 0, font: { size: 11, family: 'DM Sans' } }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#64748b', font: { size: 11, family: 'DM Sans' } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const n = Number(ctx.raw ?? 0);
                return `${n} demande${n > 1 ? 's' : ''}`;
              }
            }
          }
        }
      }
    });
  }

  // ── Formatage / labels ────────────────────────────────────────────────

  statutPillClass(statut: string): string {
    switch ((statut ?? '').toLowerCase()) {
      case 'approved':
        return 'log-type-pill log-type-pill-green';
      case 'pending':
        return 'log-type-pill log-type-pill-orange';
      case 'rejected':
        return 'log-type-pill log-type-pill-red';
      case 'expired':
        return 'log-type-pill log-type-pill-gray';
      default:
        return 'log-type-pill log-type-pill-gray';
    }
  }

  statutLabel(statut: string): string {
    switch ((statut ?? '').toLowerCase()) {
      case 'approved':
        return 'Approuvé';
      case 'pending':
        return 'En attente';
      case 'rejected':
        return 'Refusé';
      case 'expired':
        return 'Expiré';
      default:
        return statut || '—';
    }
  }

  typeLabel(type: string): string {
    const t = (type ?? '').toLowerCase();
    if (!t) return '—';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  periodeLabel(m: RhMovement): string {
    const debut = this.formatYmd(m.dateDebut);
    const fin = this.formatYmd(m.dateFin);
    if (debut === '—' && fin === '—') return '—';
    return `${debut} → ${fin}`;
  }

  formatYmd(ymd: string): string {
    if (!ymd) return '—';
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  relativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const diffMs = Date.now() - d.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) return `il y a ${diffMinutes <= 1 ? 1 : diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `il y a ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'hier';
    return `il y a ${diffDays} jours`;
  }

  noteLabel(note: number | null): string {
    return note == null ? '—' : `${note}/100`;
  }
}
