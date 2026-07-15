import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { AdminService, ManagersOverview, ManagerOverviewRow } from '../../services/admin.service';
import { ToastService } from '../../components/toast/toast.service';
import { AdminManagerActionsPanelComponent } from './admin-manager-actions-panel/admin-manager-actions-panel.component';

@Component({
  selector: 'app-vue-managers',
  standalone: true,
  imports: [CommonModule, SidebarAdminComponent, AdminManagerActionsPanelComponent],
  templateUrl: './vue-managers.component.html',
  styleUrl: './vue-managers.component.scss'
})
export class VueManagersComponent {
  overview: ManagersOverview | null = null;
  loading = true;
  todayLabel = '';

  selectedManagerId: number | null = null;

  constructor(private admin: AdminService, private toast: ToastService) {
    this.refresh();
  }

  get managers(): ManagerOverviewRow[] {
    return this.overview?.managers ?? [];
  }

  get selectedManager(): ManagerOverviewRow | null {
    return this.managers.find((m) => m.employeeId === this.selectedManagerId) ?? null;
  }

  toggleManage(manager: ManagerOverviewRow): void {
    this.selectedManagerId = this.selectedManagerId === manager.employeeId ? null : manager.employeeId;
  }

  private refresh() {
    this.loading = true;
    this.admin.getManagersOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.loading = false;
        this.todayLabel = new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date());
      },
      error: () => {
        this.loading = false;
        this.toast.error('Impossible de charger la vue Managers');
      }
    });
  }

  initialsOf(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return `${a}${b}`.toUpperCase() || '??';
  }

  progressClass(percent: number): string {
    if (percent >= 70) return 'progress-fill progress-fill-green';
    if (percent >= 40) return 'progress-fill progress-fill-orange';
    return 'progress-fill progress-fill-red';
  }

  clampPercent(percent: number): number {
    return Math.max(0, Math.min(100, percent ?? 0));
  }
}
