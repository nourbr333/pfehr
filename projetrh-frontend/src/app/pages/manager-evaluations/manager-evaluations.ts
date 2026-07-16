import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, Utilisateur } from '../../services/auth';
import { ManagerService, ManagerTeamMember } from '../../services/manager.service';
import {
  CreateEmployeeEvaluationPayload,
  EmployeeEvaluation,
  EvaluationImportRowPayload,
  EvaluationService,
} from '../../services/evaluation.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

type EvalStatus = 'excellent' | 'good' | 'needs-improvement' | 'unrated';
type EvalTrend = 'up' | 'down' | 'stable' | 'none';
type ActiveTab = 'overview' | 'history';
type PeriodFilter = 'all' | 'month' | 'quarter' | 'year';

interface TeamEvalRow {
  member: ManagerTeamMember;
  evaluations: EmployeeEvaluation[];
  latestEval: EmployeeEvaluation | null;
  trend: EvalTrend;
  status: EvalStatus;
}

interface EvalForm {
  period: string;
  rating: number | null;
  objectifs: string;
  comments: string;
}

@Component({
  selector: 'app-manager-evaluations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './manager-evaluations.html',
  styleUrl: './manager-evaluations.scss',
})
export class ManagerEvaluationsComponent implements OnInit, OnDestroy {
  utilisateur: Utilisateur | null = null;
  managerId: number | null = null;
  teamRows: TeamEvalRow[] = [];
  isLoading = true;

  activeTab: ActiveTab = 'overview';
  searchTerm = '';
  filterPeriod: PeriodFilter = 'all';
  filterStatus = '';

  // Pagination (overview table)
  currentPage = 1;
  readonly pageSize = 10;

  // History tab — keyboard search
  selectedEmployeeId: number | null = null;
  historySearchTerm = '';
  historySearchFocused = false;

  // Modal create/edit
  showEvalModal = false;
  editingEval: EmployeeEvaluation | null = null;
  modalEmployeeId: number | null = null;
  modalEmpSearchTerm = '';
  modalEmpSearchFocused = false;
  evalForm: EvalForm = { period: '', rating: null, objectifs: '', comments: '' };
  isSaving = false;
  ratingTouched = false;

  get ratingError(): string {
    const r = this.evalForm.rating;
    if (r === null || r === undefined || (r as unknown as string) === '') {
      return 'La note est obligatoire.';
    }
    if (!Number.isFinite(r) || r < 0 || r > 100) {
      return 'La note doit être comprise entre 0 et 100.';
    }
    return '';
  }

  // Delete confirm
  showDeleteConfirm = false;
  deleteTarget: { employeeId: number; evaluationId: number; label: string } | null = null;
  isDeleting = false;

  // Toast
  toastMsg = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // Import Excel
  showImportModal = false;
  selectedImportFile: File | null = null;
  importFileError = '';
  importInProgress = false;

  private subs = new Subscription();

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  constructor(
    private auth: AuthService,
    private managerService: ManagerService,
    private evaluationService: EvaluationService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit(): void {
    this.managerId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (this.managerId === null) {
      this.isLoading = false;
      return;
    }
    const sub = this.loadData().subscribe({
      complete: () => {
        const params = this.route.snapshot.queryParamMap;
        const tab = params.get('tab');
        const empId = params.get('employeeId');
        if (tab === 'history' && empId) {
          const row = this.teamRows.find(r => r.member.id === empId);
          if (row) {
            this.activeTab = 'history';
            this.selectedEmployeeId = parseInt(empId, 10);
            this.historySearchTerm = row.member.name;
          }
        }
      },
    });
    this.subs.add(sub);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private loadData() {
    if (this.managerId === null) return of([] as TeamEvalRow[]);
    this.isLoading = true;
    return this.managerService
      .loadTeamForManager(this.managerId)
      .pipe(
        switchMap(members => {
          if (members.length === 0) return of([] as TeamEvalRow[]);
          const obs = members.map(m =>
            this.evaluationService.listByEmployeeId(parseInt(m.id, 10)).pipe(
              map(evals => this.buildRow(m, evals)),
              catchError(() => of(this.buildRow(m, [])))
            )
          );
          return forkJoin(obs);
        }),
        map(rows => {
          this.teamRows = rows.sort((a, b) => a.member.name.localeCompare(b.member.name));
          this.isLoading = false;
          return rows;
        }),
        catchError(() => {
          this.isLoading = false;
          this.showToast('Erreur lors du chargement des données.', 'error');
          return of([] as TeamEvalRow[]);
        })
      );
  }

  private buildRow(member: ManagerTeamMember, evaluations: EmployeeEvaluation[]): TeamEvalRow {
    const sorted = [...evaluations].sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
    );
    const latest = sorted[0] ?? null;
    return {
      member,
      evaluations: sorted,
      latestEval: latest,
      trend: this.computeTrend(sorted),
      status: this.computeStatus(latest?.rating ?? null),
    };
  }

  private computeTrend(evals: EmployeeEvaluation[]): EvalTrend {
    if (evals.length < 2) return 'none';
    const r1 = evals[0].rating;
    const r2 = evals[1].rating;
    if (r1 === null || r2 === null) return 'none';
    if (r1 > r2) return 'up';
    if (r1 < r2) return 'down';
    return 'stable';
  }

  private computeStatus(rating: number | null): EvalStatus {
    if (rating === null) return 'unrated';
    if (rating >= 80) return 'excellent';
    if (rating >= 60) return 'good';
    return 'needs-improvement';
  }

  // ── Computed getters ─────────────────────────────────────────────────────

  // Sort (overview table)
  sortDir: 'asc' | 'desc' | null = null;

  toggleDateSort(): void {
    if (this.sortDir === null || this.sortDir === 'desc') {
      this.sortDir = 'asc';
    } else {
      this.sortDir = 'desc';
    }
    this.currentPage = 1;
  }

  get filteredRows(): TeamEvalRow[] {
    let rows = this.teamRows;
    if (this.searchTerm.trim()) {
      const q = this.searchTerm.toLowerCase();
      rows = rows.filter(r => r.member.name.toLowerCase().includes(q));
    }
    if (this.filterPeriod !== 'all') {
      const now = new Date();
      let since: Date;
      if (this.filterPeriod === 'month') {
        since = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (this.filterPeriod === 'quarter') {
        since = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      } else {
        since = new Date(now.getFullYear(), 0, 1);
      }
      rows = rows.filter(r =>
        r.evaluations.some(e => e.evaluatedAt && new Date(e.evaluatedAt) >= since)
      );
    }
    if (this.filterStatus) {
      rows = rows.filter(r => r.status === this.filterStatus);
    }
    if (this.sortDir !== null) {
      const dir = this.sortDir === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const da = a.latestEval?.evaluatedAt ? new Date(a.latestEval.evaluatedAt).getTime() : 0;
        const db = b.latestEval?.evaluatedAt ? new Date(b.latestEval.evaluatedAt).getTime() : 0;
        return (da - db) * dir;
      });
    }
    return rows;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get paginatedRows(): TeamEvalRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }

  get canGoPrevious(): boolean { return this.currentPage > 1; }
  get canGoNext(): boolean { return this.currentPage < this.totalPages; }

  previousPage(): void { if (this.canGoPrevious) this.currentPage--; }
  nextPage(): void { if (this.canGoNext) this.currentPage++; }

  onFilterChange(): void { this.currentPage = 1; }

  get avgTeamRating(): number | null {
    const rated = this.teamRows.filter(r => r.latestEval?.rating != null);
    if (rated.length === 0) return null;
    const sum = rated.reduce((acc, r) => acc + (r.latestEval!.rating as number), 0);
    return Math.round(sum / rated.length);
  }

  get evaluatedThisQuarter(): number {
    const now = new Date();
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return this.teamRows.filter(r =>
      r.evaluations.some(e => new Date(e.evaluatedAt) >= qStart)
    ).length;
  }

  get unratedCount(): number {
    return this.teamRows.filter(r => r.status === 'unrated').length;
  }

  get topPerformer(): TeamEvalRow | null {
    const rated = this.teamRows.filter(r => r.latestEval?.rating != null);
    if (rated.length === 0) return null;
    return rated.reduce((best, r) =>
      (r.latestEval!.rating as number) > (best.latestEval!.rating as number) ? r : best
    );
  }

  get selectedMemberRow(): TeamEvalRow | undefined {
    return this.teamRows.find(r => parseInt(r.member.id, 10) === this.selectedEmployeeId);
  }

  // History search — keyboard
  get historyFilteredRows(): TeamEvalRow[] {
    const q = this.historySearchTerm.trim().toLowerCase();
    if (!q) return this.teamRows;
    return this.teamRows.filter(r => r.member.name.toLowerCase().includes(q));
  }

  selectHistoryMember(row: TeamEvalRow): void {
    this.selectedEmployeeId = parseInt(row.member.id, 10);
    this.historySearchTerm = row.member.name;
    this.historySearchFocused = false;
  }

  clearHistorySearch(): void {
    this.selectedEmployeeId = null;
    this.historySearchTerm = '';
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  switchTab(tab: ActiveTab): void {
    this.activeTab = tab;
  }

  viewHistory(row: TeamEvalRow): void {
    this.selectedEmployeeId = parseInt(row.member.id, 10);
    this.historySearchTerm = row.member.name;
    this.historySearchFocused = false;
    this.activeTab = 'history';
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  openCreateModal(employeeId?: number): void {
    this.editingEval = null;
    this.modalEmployeeId = employeeId ?? null;
    const preRow = employeeId ? this.teamRows.find(r => parseInt(r.member.id, 10) === employeeId) : null;
    this.modalEmpSearchTerm = preRow?.member.name ?? '';
    this.modalEmpSearchFocused = false;
    this.evalForm = { period: '', rating: null, objectifs: '', comments: '' };
    this.ratingTouched = false;
    this.showEvalModal = true;
  }

  openEditModal(row: TeamEvalRow, eval_: EmployeeEvaluation): void {
    this.editingEval = eval_;
    this.modalEmployeeId = parseInt(row.member.id, 10);
    this.modalEmpSearchTerm = row.member.name;
    this.modalEmpSearchFocused = false;
    this.evalForm = {
      period: eval_.period ?? '',
      rating: eval_.rating,
      objectifs: eval_.objectifs ?? '',
      comments: eval_.comments ?? '',
    };
    this.ratingTouched = false;
    this.showEvalModal = true;
  }

  closeModal(): void {
    this.showEvalModal = false;
    this.editingEval = null;
    this.modalEmpSearchTerm = '';
    this.modalEmpSearchFocused = false;
  }

  get modalEmpFilteredRows(): TeamEvalRow[] {
    const q = this.modalEmpSearchTerm.trim().toLowerCase();
    if (!q) return this.teamRows;
    return this.teamRows.filter(r => r.member.name.toLowerCase().includes(q));
  }

  selectModalEmployee(row: TeamEvalRow): void {
    this.modalEmployeeId = parseInt(row.member.id, 10);
    this.modalEmpSearchTerm = row.member.name;
    this.modalEmpSearchFocused = false;
  }

  saveEval(): void {
    if (!this.modalEmployeeId || this.managerId === null || this.isSaving) return;
    if (this.ratingError) {
      this.ratingTouched = true;
      return;
    }
    this.isSaving = true;
    const payload: CreateEmployeeEvaluationPayload = {
      managerId: this.managerId,
      evaluatedAt: new Date().toISOString(),
      period: this.evalForm.period || null,
      objectifs: this.evalForm.objectifs || null,
      comments: this.evalForm.comments || null,
      rating: this.evalForm.rating,
    };
    const empId = this.modalEmployeeId;
    const isEdit = this.editingEval !== null;
    const replacedId = this.editingEval?.evaluationId ?? null;
    const obs$ = isEdit
      ? this.evaluationService.updateForEmployee(empId, this.editingEval!.evaluationId, payload)
      : this.evaluationService.createForEmployee(empId, payload);

    const sub = obs$.subscribe({
      next: saved => {
        this.isSaving = false;
        this.showEvalModal = false;
        this.applyEvalLocally(empId, saved, replacedId);
        this.showToast(isEdit ? 'Évaluation modifiée.' : 'Évaluation créée.', 'success');
        this.editingEval = null;
      },
      error: () => {
        this.isSaving = false;
        this.showToast("Erreur lors de l'enregistrement.", 'error');
      },
    });
    this.subs.add(sub);
  }

  private applyEvalLocally(employeeId: number, saved: EmployeeEvaluation, replacedId: number | null): void {
    const idx = this.teamRows.findIndex(r => parseInt(r.member.id, 10) === employeeId);
    if (idx === -1) return;
    const row = this.teamRows[idx];
    const filtered = replacedId !== null
      ? row.evaluations.filter(e => e.evaluationId !== replacedId)
      : row.evaluations;
    const updated = [saved, ...filtered].sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime()
    );
    this.teamRows[idx] = this.buildRow(row.member, updated);
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  confirmDelete(employeeId: number, eval_: EmployeeEvaluation): void {
    const date = eval_.evaluatedAt ? new Date(eval_.evaluatedAt).toLocaleDateString('fr-FR') : '';
    const period = eval_.period ? ` (${eval_.period})` : '';
    this.deleteTarget = { employeeId, evaluationId: eval_.evaluationId, label: `${date}${period}` };
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteTarget = null;
  }

  executeDelete(): void {
    if (!this.deleteTarget || this.isDeleting) return;
    this.isDeleting = true;
    const { employeeId, evaluationId } = this.deleteTarget;
    const sub = this.evaluationService.deleteForEmployee(employeeId, evaluationId).subscribe({
      next: () => {
        this.isDeleting = false;
        this.showDeleteConfirm = false;
        const idx = this.teamRows.findIndex(r => parseInt(r.member.id, 10) === employeeId);
        if (idx !== -1) {
          const row = this.teamRows[idx];
          const evals = row.evaluations.filter(e => e.evaluationId !== evaluationId);
          this.teamRows[idx] = this.buildRow(row.member, evals);
        }
        this.deleteTarget = null;
        this.showToast('Évaluation supprimée.', 'success');
      },
      error: () => {
        this.isDeleting = false;
        this.showToast('Erreur lors de la suppression.', 'error');
      },
    });
    this.subs.add(sub);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  ratingToneClass(rating: number | null): string {
    if (rating === null) return 'tone-unrated';
    if (rating >= 80) return 'tone-excellent';
    if (rating >= 60) return 'tone-good';
    if (rating >= 40) return 'tone-needs';
    return 'tone-bad';
  }

  computeStatusPublic(rating: number): string {
    if (rating >= 80) return 'excellent';
    if (rating >= 60) return 'good';
    return 'needs-improvement';
  }

  ratingLabel(rating: number | null): string {
    if (rating === null) return '—';
    if (rating >= 80) return 'Excellent';
    if (rating >= 60) return 'Bien';
    if (rating >= 40) return 'À améliorer';
    return 'Insuffisant';
  }

  statusLabel(status: EvalStatus): string {
    switch (status) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Bien';
      case 'needs-improvement': return 'À améliorer';
      case 'unrated': return 'Non évalué';
    }
  }

  initiales(name: string): string {
    return name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase();
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil(): void {
    this.router.navigate(['/profil']);
  }

  // ── Import Excel ─────────────────────────────────────────────────────────

  openImportModal(): void {
    this.showImportModal = true;
    this.importFileError = '';
    this.selectedImportFile = null;
  }

  closeImportModal(): void {
    if (this.importInProgress) return;
    this.showImportModal = false;
    this.importFileError = '';
    this.selectedImportFile = null;
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedImportFile = file;
    this.importFileError = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.importFileError = 'Seuls les fichiers .xlsx sont acceptés.';
      this.selectedImportFile = null;
      input.value = '';
    }
  }

  downloadEvaluationTemplate(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['ID collaborateur', 'Période', 'Score (0-100)', 'Objectifs', 'Commentaires'];
      const example = [
        this.teamRows[0] ? parseInt(this.teamRows[0].member.id, 10) : 1,
        'Q2 2026',
        85,
        'Objectifs trimestriels',
        'Commentaire optionnel',
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 28 },
        { wch: 28 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Evaluations');
      XLSX.writeFile(wb, 'template-evaluations.xlsx');
    }).catch(() => {
      this.showToast('Impossible de générer le modèle. Rechargez la page.', 'error');
    });
  }

  submitEvaluationImport(): void {
    if (this.managerId === null) return;
    if (!this.selectedImportFile) {
      this.importFileError = 'Veuillez sélectionner un fichier Excel (.xlsx).';
      return;
    }
    if (this.importInProgress) return;

    const file = this.selectedImportFile;
    this.importInProgress = true;
    this.importFileError = '';

    import('xlsx/xlsx.mjs')
      .then((XLSX) => this.parseEvaluationImportFile(XLSX, file))
      .then((rows) => {
        if (!rows.length) {
          throw new Error('Aucune ligne exploitable dans le fichier.');
        }
        const sub = this.evaluationService.importRowsForManager(this.managerId!, rows).pipe(
          finalize(() => { this.importInProgress = false; })
        ).subscribe({
          next: (result) => {
            this.showImportModal = false;
            this.selectedImportFile = null;
            this.importFileError = '';
            let msg = `${result.importedRows} évaluation(s) importée(s) pour ${result.affectedEmployees} collaborateur(s).`;
            if (result.skippedEmployeeIds?.length) {
              msg += ` ${result.skippedEmployeeIds.length} ID ignoré(s) (hors équipe).`;
            }
            this.showToast(msg, 'success');
            this.subs.add(this.loadData().subscribe());
          },
          error: (err) => {
            const message = this.extractHttpErrorMessage(err, 'Import Excel impossible.');
            this.importFileError = message;
            this.showToast(message, 'error');
          },
        });
        this.subs.add(sub);
      })
      .catch((err: unknown) => {
        this.importInProgress = false;
        const message = err instanceof Error ? err.message : 'Impossible de lire le fichier Excel.';
        this.importFileError = message;
        this.showToast(message, 'error');
      });
  }

  private parseEvaluationImportFile(
    XLSX: typeof import('xlsx/xlsx.mjs'),
    file: File
  ): Promise<EvaluationImportRowPayload[]> {
    return file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error('Le fichier Excel est vide.');
      }
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
      });
      if (!rows.length) {
        throw new Error('Le fichier Excel est vide.');
      }

      const headerRow = rows[0].map((cell) => this.normalizeHeader(cell));
      const employeeIdx = this.findHeaderIndex(headerRow, ['id employe', 'ID collaborateur', 'employee_id', 'employee id']);
      const periodIdx = this.findHeaderIndex(headerRow, ['periode', 'période', 'period']);
      const scoreIdx = this.findHeaderIndex(headerRow, ['score (0-100)', 'score', 'note', 'rating']);
      const objectifsIdx = this.findHeaderIndex(headerRow, ['objectifs', 'objectif']);
      const commentsIdx = this.findHeaderIndex(headerRow, ['commentaires', 'comments', 'commentaire']);
      const dateIdx = this.findHeaderIndex(headerRow, ['date evaluation', 'date évaluation', 'evaluated_at', 'date']);

      if (employeeIdx < 0) {
        throw new Error('Colonne obligatoire manquante : « ID collaborateur ».');
      }
      if (scoreIdx < 0) {
        throw new Error('Colonne obligatoire manquante : « Score (0-100) ».');
      }

      const parsed: EvaluationImportRowPayload[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || this.isEmptyImportRow(row)) continue;

        const employeeId = Number.parseInt(String(row[employeeIdx] ?? '').trim(), 10);
        const rating = Number.parseInt(String(row[scoreIdx] ?? '').trim(), 10);
        if (!Number.isFinite(employeeId) || employeeId <= 0) {
          throw new Error(`Ligne ${i + 1} : ID collaborateur invalide.`);
        }
        if (!Number.isFinite(rating) || rating < 0 || rating > 100) {
          throw new Error(`Ligne ${i + 1} : score invalide (0-100).`);
        }

        const evaluatedAtRaw = dateIdx >= 0 ? String(row[dateIdx] ?? '').trim() : '';
        parsed.push({
          employeeId,
          period: periodIdx >= 0 ? String(row[periodIdx] ?? '').trim() || null : null,
          rating,
          objectifs: objectifsIdx >= 0 ? String(row[objectifsIdx] ?? '').trim() || null : null,
          comments: commentsIdx >= 0 ? String(row[commentsIdx] ?? '').trim() || null : null,
          evaluatedAt: evaluatedAtRaw || null,
        });
      }
      return parsed;
    });
  }

  private normalizeHeader(value: string | number | null): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private findHeaderIndex(headers: string[], aliases: string[]): number {
    for (const alias of aliases) {
      const normalized = this.normalizeHeader(alias);
      const idx = headers.findIndex((header) => header === normalized);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  private isEmptyImportRow(row: (string | number | null)[]): boolean {
    return row.every((cell) => String(cell ?? '').trim() === '');
  }

  private extractHttpErrorMessage(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object') {
      const message = body.message ?? body.detail ?? body.error;
      if (typeof message === 'string' && message.trim()) return message;
    }
    if (typeof err?.message === 'string' && err.message.trim() && !err.message.startsWith('Http failure')) {
      return err.message;
    }
    if (err?.status === 403) {
      return 'Accès refusé. Vérifiez votre session manager.';
    }
    if (err?.status === 0) {
      return 'Serveur injoignable. Vérifiez que le backend est démarré.';
    }
    return fallback;
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMsg = msg;
    this.toastType = type;
    this.toastVisible = true;
    this.toastTimer = setTimeout(() => { this.toastVisible = false; }, 3500);
  }
}
