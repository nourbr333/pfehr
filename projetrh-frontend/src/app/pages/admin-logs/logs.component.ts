import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { ToastService } from '../../components/toast/toast.service';
import { AdminLog, AdminService } from '../../services/admin.service';

export type LogPeriod = 'all' | 'today' | 'month';

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarAdminComponent],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss'
})
export class LogsComponent {
  private allLogs: AdminLog[] = [];

  logs: AdminLog[] = [];
  searchTerm = '';
  periodFilter: LogPeriod = 'all';

  readonly periodOptions: ReadonlyArray<{ id: LogPeriod; label: string }> = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'month', label: 'Mois' },
    { id: 'all', label: 'Tous' }
  ];

  sortDir: SortDir = 'desc';
  pageSize = 15;
  currentPage = 1;
  logsLoading = false;

  constructor(private admin: AdminService, private toast: ToastService) {
    this.loadLogs();
  }

  private loadLogs() {
    this.logsLoading = true;
    this.admin.getLogs().subscribe({
      next: (logs) => {
        this.allLogs = logs ?? [];
        this.applyFilters();
        this.logsLoading = false;
      },
      error: () => {
        this.allLogs = [];
        this.logs = [];
        this.logsLoading = false;
        this.toast.error('Impossible de charger les logs');
      }
    });
  }

  private applyFilters() {
    const search = this.searchTerm.trim().toLowerCase();
    const { start, end } = this.periodBounds();

    let rows = this.allLogs.filter((log) => {
      const date = this.parseLogDate(log.date);
      if (start && (!date || date < start)) return false;
      if (end && (!date || date > end)) return false;
      if (!search) return true;

      const haystack = [
        log.action,
        log.cible,
        log.effectuePar,
        log.details,
        this.actionBadgeLabel(log.action)
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });

    rows = rows.slice().sort((a, b) => {
      const diff = this.parseLogDate(a.date).getTime() - this.parseLogDate(b.date).getTime();
      return this.sortDir === 'asc' ? diff : -diff;
    });

    const totalPages = Math.max(1, Math.ceil(rows.length / this.pageSize));
    this.currentPage = Math.min(this.currentPage, totalPages);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.logs = rows.slice(startIndex, startIndex + this.pageSize);
  }

  private periodBounds(): { start: Date | null; end: Date | null } {
    const now = new Date();

    if (this.periodFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }

    if (this.periodFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start, end };
    }

    return { start: null, end: null };
  }

  private parseLogDate(iso: string): Date {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  get totalCount(): number {
    const search = this.searchTerm.trim().toLowerCase();
    const { start, end } = this.periodBounds();
    return this.allLogs.filter((log) => {
      const date = this.parseLogDate(log.date);
      if (start && date < start) return false;
      if (end && date > end) return false;
      if (!search) return true;
      return [log.action, log.cible, log.effectuePar, log.details, this.actionBadgeLabel(log.action)]
        .join(' ')
        .toLowerCase()
        .includes(search);
    }).length;
  }

  get currentPageStart(): number {
    if (this.totalCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get currentPageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  onSearchChange() {
    this.currentPage = 1;
    this.applyFilters();
  }

  setPeriod(period: LogPeriod) {
    if (this.periodFilter === period) return;
    this.periodFilter = period;
    this.currentPage = 1;
    this.applyFilters();
  }

  onSortDate() {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }

  setPage(page: number) {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages);
    this.applyFilters();
  }

  exportExcel() {
    const search = this.searchTerm.trim().toLowerCase();
    const { start, end } = this.periodBounds();
    const rows = this.allLogs
      .filter((log) => {
        const date = this.parseLogDate(log.date);
        if (start && date < start) return false;
        if (end && date > end) return false;
        if (!search) return true;
        return [log.action, log.cible, log.effectuePar, log.details, this.actionBadgeLabel(log.action)]
          .join(' ')
          .toLowerCase()
          .includes(search);
      })
      .map((log) => {
        const [datePart, timePart] = (log.date ?? '').split('T');
        return [
          this.actionBadgeLabel(log.action),
          log.cible,
          log.effectuePar,
          datePart ?? '',
          (timePart ?? '').slice(0, 5),
          log.details
        ];
      });

    const headers = ['Action', 'Utilisateur', 'Effectué par', 'Date', 'Heure', 'Détails'];
    const filename = `activites_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    import('xlsx/xlsx.mjs')
      .then((XLSX) => {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Activités');
        XLSX.writeFile(wb, filename);
      })
      .catch(() => this.toast.error('Erreur lors de l\'export'));
  }

  actionBadgeLabel(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR': return 'Création';
      case 'SUPPRESSION': return 'Suppression';
      case 'MODIFICATION_ROLE': return 'Modif. rôle';
      case 'MODIFICATION_UTILISATEUR': return 'Modification';
      case 'DESACTIVATION_COMPTE': return 'Désactivation';
      case 'ACTIVATION_COMPTE': return 'Activation';
      case 'VALIDATION_COMPTE': return 'Validation';
      case 'REINITIALISATION_MDP': return 'Réinit. MDP';
      case 'CHANGEMENT_MDP': return 'Modif. MDP';
      case 'CONNEXION': return 'Connexion';
      default: return action;
    }
  }

  actionBadgeClass(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR': return 'status-badge status-created';
      case 'SUPPRESSION': return 'status-badge status-deleted';
      case 'MODIFICATION_ROLE':
      case 'MODIFICATION_UTILISATEUR': return 'status-badge status-updated';
      case 'DESACTIVATION_COMPTE': return 'status-badge status-muted';
      case 'ACTIVATION_COMPTE': return 'status-badge status-active';
      case 'VALIDATION_COMPTE': return 'status-badge status-validated';
      case 'REINITIALISATION_MDP':
      case 'CHANGEMENT_MDP': return 'status-badge status-security';
      case 'CONNEXION': return 'status-badge status-login';
      default: return 'status-badge';
    }
  }

  dateLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }

  truncate(text: string, max: number): string {
    const value = text ?? '';
    return value.length <= max ? value : `${value.slice(0, max)}…`;
  }
}
