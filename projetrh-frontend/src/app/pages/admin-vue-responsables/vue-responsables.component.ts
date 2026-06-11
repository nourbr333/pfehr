import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { AdminService, RhOverview, RhMovement } from '../../services/admin.service';
import { ToastService } from '../../components/toast/toast.service';

let chartJsRegistered = false;

@Component({
  selector: 'app-vue-responsables',
  standalone: true,
  imports: [CommonModule, SidebarAdminComponent],
  templateUrl: './vue-responsables.component.html',
  styleUrl: './vue-responsables.component.scss'
})
export class VueResponsablesComponent implements OnDestroy {
  overview: RhOverview | null = null;
  loading = true;
  todayLabel = '';

  @ViewChild('leavesMonthlyCanvas') leavesMonthlyCanvas?: ElementRef<HTMLCanvasElement>;
  private leavesMonthlyChart: Chart | null = null;

  constructor(
    private admin: AdminService,
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
    this.leavesMonthlyChart?.destroy();
    this.leavesMonthlyChart = null;
  }

  get hasMonthlyChart(): boolean {
    return (this.overview?.demandesCongesParMois ?? []).some(m => m.total > 0);
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
}
