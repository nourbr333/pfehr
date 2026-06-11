import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { AdminLog, AdminRole, AdminService, AdminUser, DashboardStats } from '../../services/admin.service';
import { ToastService } from '../../components/toast/toast.service';
import { forkJoin } from 'rxjs';

let chartJsRegistered = false;

@Component({
  selector: 'app-dashboard-admin',
  standalone: true,
  imports: [CommonModule, SidebarAdminComponent],
  templateUrl: './dashboard-admin.component.html',
  styleUrl: './dashboard-admin.component.scss'
})
export class DashboardAdminComponent implements OnDestroy {
  stats: DashboardStats | null = null;

  users: AdminUser[] = [];
  roles: AdminRole[] = [];
  logs: AdminLog[] = [];

  pendingUsers: AdminUser[] = [];

  todayLabel = '';

  /** Filtre par catégorie du journal récent (cohérent avec la page Activités). */
  recentFilter: 'TOUS' | 'CONNEXIONS' | 'COMPTES' | 'SECURITE' = 'TOUS';

  readonly recentChips: ReadonlyArray<{ id: DashboardAdminComponent['recentFilter']; label: string }> = [
    { id: 'TOUS', label: 'Toutes' },
    { id: 'CONNEXIONS', label: 'Connexions' },
    { id: 'COMPTES', label: 'Comptes' },
    { id: 'SECURITE', label: 'Sécurité' }
  ];

  @ViewChild('activityHourCanvas') activityHourCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('rolesActiveCanvas') rolesActiveCanvas?: ElementRef<HTMLCanvasElement>;

  private activityHourChart: Chart | null = null;
  private rolesActiveChart: Chart | null = null;

  constructor(
    private admin: AdminService,
    private router: Router,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    if (!chartJsRegistered) {
      Chart.register(...registerables);
      chartJsRegistered = true;
    }
    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  /** Données réelles : au moins une entrée dans les journaux d’audit. */
  get hasActivityHourChart(): boolean {
    return this.logs.length > 0;
  }

  /** 5 dernières entrées de la catégorie sélectionnée. */
  get recentLogs(): AdminLog[] {
    const source =
      this.recentFilter === 'TOUS'
        ? this.logs
        : this.logs.filter(l => this.categoryOf(l.action) === this.recentFilter);
    return source.slice(0, 5);
  }

  setRecentFilter(filter: DashboardAdminComponent['recentFilter']) {
    this.recentFilter = filter;
  }

  private categoryOf(action: AdminLog['action']): 'CONNEXIONS' | 'COMPTES' | 'SECURITE' {
    if (action === 'CONNEXION') return 'CONNEXIONS';
    if (action === 'MODIFICATION_ROLE' || action === 'REINITIALISATION_MDP' || action === 'SUPPRESSION') {
      return 'SECURITE';
    }
    return 'COMPTES';
  }

  private refresh() {
    forkJoin({
      stats: this.admin.getDashboardStats(),
      users: this.admin.getUsers(),
      roles: this.admin.getRoles(),
      logs: this.admin.getLogs()
    }).subscribe({
      next: ({ stats, users, roles, logs }) => {
        this.stats = stats;
        this.users = users;
        this.roles = roles;
        this.logs = logs;
        this.pendingUsers = this.users.filter(u => u.validated === false);
        this.todayLabel = new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
        this.scheduleCharts();
      },
      error: () => this.toast.error('Impossible de charger le dashboard admin')
    });
  }

  private scheduleCharts(): void {
    this.destroyCharts();
    // Le canvas d’activité est sous *ngIf : sans passage CD explicite, setTimeout(0)
    // peut tourner avant que ViewChild soit disponible → graphique vide.
    this.cdr.detectChanges();
    queueMicrotask(() => {
      this.renderActivityByHourChart();
      this.renderActiveUsersByRoleChart();
    });
  }

  private destroyCharts(): void {
    this.activityHourChart?.destroy();
    this.activityHourChart = null;
    this.rolesActiveChart?.destroy();
    this.rolesActiveChart = null;
  }

  /** Compte chaque entrée de journal selon l’heure locale du serveur enregistrée dans `date` (ISO). */
  private computeLogCountsByLocalHour(): number[] {
    const counts = new Array<number>(24).fill(0);
    for (const log of this.logs) {
      const t = new Date(log.date);
      if (Number.isNaN(t.getTime())) continue;
      counts[t.getHours()] += 1;
    }
    return counts;
  }

  private computeActiveUsersByRole(): { labels: string[]; data: number[]; colors: string[] } {
    const actifs = this.users.filter(u => u.statut === 'actif');
    let nAdmin = 0;
    let nManager = 0;
    let nResp = 0;
    for (const u of actifs) {
      if (u.role === 'ADMIN') nAdmin += 1;
      else if (u.role === 'MANAGER') nManager += 1;
      else nResp += 1;
    }
    return {
      labels: ['Admin', 'Manager', 'Responsable RH'],
      data: [nAdmin, nManager, nResp],
      colors: ['#e74c3c', '#3498db', '#27ae60']
    };
  }

  private renderActivityByHourChart(): void {
    const el = this.activityHourCanvas?.nativeElement;
    if (!el || !this.hasActivityHourChart) return;

    const counts = this.computeLogCountsByLocalHour();
    const labels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')} h`);

    this.activityHourChart = new Chart(el, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Événements (journal)',
            data: counts,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
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
            ticks: {
              color: '#64748b',
              maxRotation: 45,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
              font: { size: 10, family: 'DM Sans' }
            }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e2e8f0' },
            ticks: {
              color: '#64748b',
              precision: 0,
              font: { size: 11, family: 'DM Sans' }
            }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#64748b', font: { size: 11, family: 'DM Sans' } }
          },
          tooltip: {
            ...this.tooltipTheme(),
            callbacks: {
              label: (ctx) => {
                const n = Number(ctx.raw ?? 0);
                return `${n} événement${n > 1 ? 's' : ''}`;
              }
            }
          }
        }
      }
    });
  }

  private renderActiveUsersByRoleChart(): void {
    const el = this.rolesActiveCanvas?.nativeElement;
    if (!el) return;

    const { labels, data, colors } = this.computeActiveUsersByRole();

    this.rolesActiveChart = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Utilisateurs actifs',
            data,
            backgroundColor: colors,
            borderRadius: 6,
            borderSkipped: false,
            categoryPercentage: 0.55,
            barPercentage: 0.72
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 11, family: 'DM Sans' } }
          },
          y: {
            beginAtZero: true,
            grid: { color: '#e2e8f0' },
            ticks: {
              color: '#64748b',
              precision: 0,
              stepSize: 1,
              font: { size: 11, family: 'DM Sans' }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...this.tooltipTheme(),
            callbacks: {
              label: (ctx) => {
                const n = Number(ctx.raw ?? 0);
                return `${n} utilisateur${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}`;
              }
            }
          }
        }
      }
    });
  }

  private tooltipTheme() {
    return {
      backgroundColor: '#0f172a',
      titleColor: '#ffffff',
      bodyColor: '#ffffff',
      padding: 10,
      cornerRadius: 8,
      displayColors: false
    };
  }

  get totalUsers(): number {
    return this.stats?.totalUsers ?? 0;
  }

  get activeUsers(): number {
    return this.stats?.actifs ?? 0;
  }

  get inactiveUsers(): number {
    return this.stats?.inactifs ?? 0;
  }

  get pendingCount(): number {
    return this.stats?.pendingValidationCount ?? 0;
  }

  onGoPendingAccounts() {
    if (this.pendingCount <= 0) return;
    this.router.navigate(['/admin/utilisateurs'], { queryParams: { validation: 'non-valides' } });
  }

  onGoLogs() {
    this.router.navigate(['/admin/logs']);
  }

  onGoUsers() {
    this.router.navigate(['/admin/utilisateurs']);
  }

  onGoVueResponsables() {
    this.router.navigate(['/admin/vue-responsables']);
  }

  onGoVueManagers() {
    this.router.navigate(['/admin/vue-managers']);
  }

  onValidateUser(userId: string) {
    this.admin.validateAccount(userId).subscribe({
      next: () => {
        this.toast.success('Compte validé');
        this.refresh();
      },
      error: () => this.toast.error('Erreur lors de la validation')
    });
  }

  onSeeUser(userId: string) {
    this.router.navigate(['/admin/utilisateurs'], { queryParams: { highlightUserId: userId } });
  }

  initialsOf(name: string): string {
    const parts = (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const first = (parts[0]?.[0] ?? '').toUpperCase();
    const second = (parts.length > 1 ? parts[parts.length - 1]?.[0] : '')?.toUpperCase();
    const res = `${first}${second}`.trim();
    return res || '??';
  }

  fullNameOf(u: AdminUser): string {
    const nom = (u.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (u.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }

  roleBadgeClass(role: AdminUser['role']): string {
    if (role === 'ADMIN') return 'role-badge role-badge-admin';
    if (role === 'MANAGER') return 'role-badge role-badge-manager';
    return 'role-badge role-badge-resp';
  }

  roleLabel(role: AdminUser['role']): string {
    if (role === 'ADMIN') return 'Admin';
    if (role === 'MANAGER') return 'Manager';
    return 'Responsable RH';
  }

  actionPillClass(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR':
        return 'action-pill action-pill-green';
      case 'SUPPRESSION':
        return 'action-pill action-pill-red';
      case 'MODIFICATION_ROLE':
        return 'action-pill action-pill-orange';
      case 'DESACTIVATION_COMPTE':
        return 'action-pill action-pill-gray';
      case 'ACTIVATION_COMPTE':
        return 'action-pill action-pill-green-light';
      case 'VALIDATION_COMPTE':
        return 'action-pill action-pill-blue';
      case 'REINITIALISATION_MDP':
        return 'action-pill action-pill-blue-light';
      case 'CONNEXION':
        return 'action-pill action-pill-violet';
      default:
        return 'action-pill';
    }
  }

  actionLabel(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR':
        return 'Création';
      case 'SUPPRESSION':
        return 'Suppression';
      case 'MODIFICATION_ROLE':
        return 'Modif. rôle';
      case 'DESACTIVATION_COMPTE':
        return 'Désactivation';
      case 'ACTIVATION_COMPTE':
        return 'Activation';
      case 'VALIDATION_COMPTE':
        return 'Validation';
      case 'REINITIALISATION_MDP':
        return 'Réinit. MDP';
      case 'CONNEXION':
        return 'Connexion';
      default:
        return action;
    }
  }

  relativeDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';

    const diffMs = Date.now() - d.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) {
      return `il y a ${diffMinutes <= 1 ? 1 : diffMinutes} min`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `il y a ${diffHours}h`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'hier';
    return `il y a ${diffDays} jours`;
  }

  formatDateYmd(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d);
  }
}
