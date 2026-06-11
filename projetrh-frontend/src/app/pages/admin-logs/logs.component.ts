import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { ToastService } from '../../components/toast/toast.service';
import { AdminLog, AdminRole, AdminService, AdminUser } from '../../services/admin.service';
import { forkJoin } from 'rxjs';

/** Onglets de séparation des activités par type. */
export type ActivityTab = 'TOUS' | 'CONNEXIONS' | 'COMPTES' | 'SECURITE';

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-logs',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarAdminComponent],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss'
})
export class LogsComponent {
  logs: AdminLog[] = [];
  users: AdminUser[] = [];
  roles: AdminRole[] = [];
  ciblesDisponibles: string[] = [];

  searchTerm = '';
  activeTab: ActivityTab = 'TOUS';
  userCible = '';

  readonly tabs: ReadonlyArray<{ id: ActivityTab; label: string }> = [
    { id: 'TOUS', label: 'Toutes' },
    { id: 'CONNEXIONS', label: 'Connexions' },
    { id: 'COMPTES', label: 'Gestion des comptes' },
    { id: 'SECURITE', label: 'Sécurité' }
  ];

  dateFrom = '';
  dateTo = '';

  sortDir: SortDir = 'desc';

  pageSize = 10;
  currentPage = 1;
  totalElements = 0;
  serverTotalPages = 1;
  tabCounts: Record<string, number> = {};
  logsLoading = false;

  constructor(private admin: AdminService, private toast: ToastService) {
    this.refresh();
  }

  private refresh() {
    forkJoin({
      users: this.admin.getUsers(),
      roles: this.admin.getRoles(),
      targets: this.admin.getLogTargets()
    }).subscribe({
      next: ({ users, roles, targets }) => {
        this.users = users;
        this.roles = roles;
        this.ciblesDisponibles = targets ?? [];
        this.loadLogsPage();
      },
      error: () => this.toast.error('Impossible de charger les logs')
    });
  }

  private loadLogsPage() {
    this.logsLoading = true;
    this.admin.getLogsPage({
      page: this.currentPage - 1,
      size: this.pageSize,
      search: this.searchTerm,
      tab: this.activeTab,
      cible: this.userCible,
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      sort: this.sortDir
    }).subscribe({
      next: (page) => {
        this.logs = page.content ?? [];
        this.totalElements = page.totalElements ?? 0;
        this.serverTotalPages = Math.max(1, page.totalPages ?? 1);
        this.currentPage = (page.page ?? 0) + 1;
        this.tabCounts = page.tabCounts ?? {};
        this.logsLoading = false;
      },
      error: () => {
        this.logs = [];
        this.totalElements = 0;
        this.serverTotalPages = 1;
        this.logsLoading = false;
        this.toast.error('Impossible de charger les logs');
      }
    });
  }

  fullNameOf(u: AdminUser): string {
    const nom = (u.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (u.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }

  get totalCount(): number {
    return this.totalElements;
  }

  get currentPageStart(): number {
    if (this.totalCount === 0) return 0;
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get currentPageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }

  get totalPages(): number {
    return this.serverTotalPages;
  }

  applyFilters() {
    this.currentPage = 1;
    this.loadLogsPage();
  }

  setTab(tab: ActivityTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.applyFilters();
  }

  /** Nombre d'entrées par onglet (counts serveur, hors filtre d'onglet actif). */
  tabCount(tab: ActivityTab): number {
    return this.tabCounts[tab] ?? 0;
  }

  onSortDate() {
    this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    this.currentPage = 1;
    this.loadLogsPage();
  }

  resetFilters() {
    this.searchTerm = '';
    this.activeTab = 'TOUS';
    this.userCible = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.applyFilters();
  }

  // Pagination
  get pagedLogs(): AdminLog[] {
    return this.logs;
  }

  setPage(page: number) {
    const p = Math.min(Math.max(1, page), this.totalPages);
    this.currentPage = p;
    this.loadLogsPage();
  }

  setPageFromButton(b: number | 'ellipsis') {
    if (b === 'ellipsis') return;
    this.setPage(b);
  }

  pageButtons(): Array<number | 'ellipsis'> {
    const total = this.totalPages;
    if (total <= 6) return Array.from({ length: total }, (_, i) => i + 1);

    // "← Précédent" "1" "2" "3" "..." "Suivant →"
    return [1, 2, 3, 'ellipsis', total];
  }

  // Excel Export
  exportExcel() {
    try {
      const fileDate = new Date();
      const yyyyMmDd = fileDate.toISOString().slice(0, 10);
      const tabSuffix = this.activeTab === 'TOUS' ? '' : `_${this.activeTab.toLowerCase()}`;
      const filename = `activites_export${tabSuffix}_${yyyyMmDd}.xlsx`;

      const headers = ['Type Action', 'Utilisateur Concerné', 'Email', 'Effectué Par', 'Date', 'Heure', 'Détails'];

      this.admin.getLogsPage({
        unpaged: true,
        search: this.searchTerm,
        tab: this.activeTab,
        cible: this.userCible,
        dateFrom: this.dateFrom,
        dateTo: this.dateTo,
        sort: this.sortDir
      }).subscribe({
        next: (page) => {
          const rows = (page.content ?? []).map(l => {
            const cibleEmail = this.emailForCible(l.cible);
            const [datePart, timePart] = (l.date ?? '').split('T');
            const time = (timePart ?? '').slice(0, 5);
            return [
              this.actionBadgeLabel(l.action),
              l.cible,
              cibleEmail,
              l.effectuePar,
              datePart ?? '',
              time ?? '',
              l.details
            ];
          });

          import('xlsx/xlsx.mjs').then((XLSX) => {
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Activités');
            XLSX.writeFile(wb, filename);
          });
        },
        error: () => this.toast.error('Erreur lors de l\'export')
      });
    } catch {
      this.toast.error('Erreur lors de l\'export');
    }
  }

  // Display helpers
  actionBadgeLabel(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR':
        return 'Création';
      case 'SUPPRESSION':
        return 'Suppression';
      case 'MODIFICATION_ROLE':
        return 'Modif. rôle';
      case 'MODIFICATION_UTILISATEUR':
        return 'Modification';
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

  actionBadgeClass(action: AdminLog['action']): string {
    switch (action) {
      case 'CREATION_UTILISATEUR':
        return 'log-type-pill log-type-pill-green';
      case 'SUPPRESSION':
        return 'log-type-pill log-type-pill-red';
      case 'MODIFICATION_ROLE':
        return 'log-type-pill log-type-pill-orange';
      case 'MODIFICATION_UTILISATEUR':
        return 'log-type-pill log-type-pill-orange';
      case 'DESACTIVATION_COMPTE':
        return 'log-type-pill log-type-pill-gray';
      case 'ACTIVATION_COMPTE':
        return 'log-type-pill log-type-pill-green-light';
      case 'VALIDATION_COMPTE':
        return 'log-type-pill log-type-pill-blue';
      case 'REINITIALISATION_MDP':
        return 'log-type-pill log-type-pill-blue-light';
      case 'CONNEXION':
        return 'log-type-pill log-type-pill-violet';
      default:
        return 'log-type-pill';
    }
  }

  emailForCible(cible: string): string {
    const u = this.users.find(x => this.fullNameOf(x) === cible);
    return u?.email ?? '';
  }

  initialsOf(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return `${a}${b}`.toUpperCase() || '??';
  }

  dateTimeLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return (
      new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) +
      ' à ' +
      new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
    );
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

  truncate(text: string, max: number): string {
    const s = text ?? '';
    if (s.length <= max) return s;
    return s.slice(0, max) + '...';
  }
}

