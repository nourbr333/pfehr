import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, Utilisateur } from '../../services/auth';
import { ManagerService } from '../../services/manager.service';
import { EmployeeService, Employee } from '../../services/employee.service';
import {
  CreateObjectivePayload,
  ManagerObjective,
  ManagerOkrService,
  ObjectiveActionType,
  ObjectiveRiskStatus,
  OkrImportRow,
  OkrImportPreviewResult,
  UpdateObjectivePayload,
} from '../../services/manager-okr.service';
import { ManagerCrossAnalysisService } from '../../services/manager-cross-analysis.service';
import { ContinuityPlanResult, ManagerAdvancedAbsencesService, ObjectiveAbsenceImpactItem } from '../../services/manager-advanced-absences.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { Chart, ChartConfiguration, Plugin, registerables } from 'chart.js';
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix';
import { isActiveOkrForAnalysis } from '../../utils/okr-active';

Chart.register(...registerables, MatrixController, MatrixElement);

type ObjectiveScope = 'Équipe' | 'Individuel';

interface HeatmapMatrixPoint {
  x: string;
  y: string;
  v: number;
}

const HEATMAP_DELAY_LABELS = ['Élevé', 'Moyen', 'Faible'] as const;
const HEATMAP_PROXIMITY_LABELS = ['<= 14 jours', '15-30 jours', '> 30 jours'] as const;

const heatmapCellLabelsPlugin: Plugin<'matrix'> = {
  id: 'okrHeatmapCellLabels',
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0];
    if (!dataset) return;
    const meta = chart.getDatasetMeta(0);
    const { ctx } = chart;
    meta.data.forEach((element, index) => {
      const raw = dataset.data[index] as HeatmapMatrixPoint | undefined;
      if (!raw) return;
      const center = (element as MatrixElement).getCenterPoint();
      if (center.x == null || center.y == null) return;
      const { x, y } = center;
      const count = raw.v;
      ctx.save();
      ctx.fillStyle = count >= 2 ? '#991b1b' : count === 1 ? '#92400e' : '#94a3b8';
      ctx.font = count > 0 ? '700 15px "DM Sans", sans-serif' : '500 13px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count > 0 ? String(count) : '—', x, y);
      ctx.restore();
    });
  }
};

interface ObjectiveItem {
  id: number;
  code: string;
  ownerEmployeeId: number;
  titre: string;
  scope: ObjectiveScope;
  proprietaire: string;
  /** All member names (for TEAM scope, can be multiple) */
  memberNames: string[];
  equipe: string;
  horizon: string;
  dueDate: string;
  progress: number;
  weight: number;
  risk: 'on_track' | 'at_risk' | 'off_track';
  retardDays: number;
  dependencies: string[];
  lastUpdate: string;
  note?: string;
}

@Component({
  selector: 'app-manager-okr',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent, CommonModule],
  templateUrl: './manager-okr.html',
  styleUrl: './manager-okr.scss'
})
export class ManagerOkrComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('riskHeatmapCanvas') riskHeatmapCanvas?: ElementRef<HTMLCanvasElement>;

  utilisateur: Utilisateur | null;
  private riskHeatmapChart: Chart<'matrix'> | null = null;
  isLoading = false;
  loadError = '';
  managerEmployeeId: number | null = null;

  searchTerm = '';
  selectedScope: 'all' | ObjectiveScope = 'all';
  selectedRisk: 'all' | 'on_track' | 'at_risk' | 'off_track' = 'all';

  quickProgress = 0;
  quickComment = '';
  selectedObjectiveId: number | null = null;

  newObjectiveTitle = '';
  newObjectiveScope: 'TEAM' | 'INDIVIDUAL' = 'TEAM';
  newObjectiveHorizon = 'Q2 2026';
  newObjectiveDueDate = '';
  newObjectiveDependencies = '';
  newObjectiveOwnerEmployeeId: number | null = null;
  newObjectiveTeamMemberIds: number[] = [];
  teamMemberSearch = '';
  teamPickerOpen = false;
  ownerSearch = '';
  ownerDropdownOpen = false;

  actionPlanType: ObjectiveActionType = 'REPLAN';

  // Tab state
  activeTab = 'portefeuille';
  activeActionTab = 'create';

  // Create form extras
  newObjectiveDescription = '';

  // Plan panel (own objective selector + extra fields)
  planObjectiveId: number | null = null;
  planDescription = '';
  planDueDate = '';

  // CSV Import — two-step flow
  private previewSub?: Subscription;
  isImportModalOpen = false;
  csvFile: File | null = null;
  csvFileName = '';
  isDragging = false;
  importLoading = false;

  // Team members for owner selectors
  teamMembers: Employee[] = [];

  // View modal
  viewingObjective: ObjectiveItem | null = null;

  // Toast notification (fixed-position, always visible)
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  toastVisible = false;
  private _toastTimer: any = null;

  // Action plan inline feedback
  planSuccessMessage = '';
  planErrorMessage = '';

  // Progress update inline feedback
  progressErrorMessage = '';
  progressSuccessMessage = '';

  // Create form feedback
  isCreating = false;
  createSuccess = '';
  createError = '';
  createValidationError = '';

  // Portfolio — edit / delete
  editingObjective: ObjectiveItem | null = null;
  editDependencies = '';
  editTitle = '';
  editScope: 'TEAM' | 'INDIVIDUAL' = 'TEAM';
  editOwnerId = 0;
  editHorizon = '';
  editDueDate = '';
  editProgress = 0;
  editWeighting = 1;
  editLoading = false;
  editError = '';

  // Portfolio — delete confirmation modal
  confirmDeleteObjective: ObjectiveItem | null = null;
  deleteLoading = false;
  deleteError = '';
  importError = '';
  importSuccess = '';
  // Preview state (step 2)
  pendingRows: OkrImportRow[] | null = null;
  importPage = 1;
  readonly importPageSize = 7;

  portfolioPage = 1;
  readonly portfolioPageSize = 10;
  editingRowIdx: number | null = null;
  editingRow: OkrImportRow | null = null;

  objectives: ObjectiveItem[] = [];
  crossImpacts: ObjectiveAbsenceImpactItem[] = [];
  continuityPlans: ContinuityPlanResult[] = [];
  highlightedObjectiveId: number | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private managerService: ManagerService,
    private managerOkrService: ManagerOkrService,
    private crossAnalysisService: ManagerCrossAnalysisService,
    private advancedAbsencesService: ManagerAdvancedAbsencesService,
    private employeeService: EmployeeService
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit(): void {
    this.managerEmployeeId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (this.managerEmployeeId == null) {
      this.loadError = 'Manager non identifié.';
      return;
    }
    this.newObjectiveDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    this.loadDashboard();
    this.loadCrossAnalysis();
    this.loadContinuityPlans();
    // Deep-link: open correct tab and highlight the targeted objective
    this.route.queryParams.subscribe(params => {
      if (params['tab']) this.activeTab = params['tab'];
      if (params['objectiveId']) {
        this.highlightedObjectiveId = +params['objectiveId'];
        if (params['tab'] === 'analyse') {
          setTimeout(() => this.scrollToAbsencesCapacitePanel(), 150);
        }
      }
      if (this.activeTab === 'analyse') {
        setTimeout(() => this.renderRiskHeatmap(), 0);
      }
    });
    const mid = this.managerEmployeeId;
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.teamMembers = employees.filter(e => e.managerId === mid);
      },
      error: () => { /* silently fail */ }
    });
  }

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  get filteredObjectives(): ObjectiveItem[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.objectives
      .filter((objective) => this.selectedScope === 'all' || objective.scope === this.selectedScope)
      .filter((objective) => this.selectedRisk === 'all' || objective.risk === this.selectedRisk)
      .filter((objective) => this.matchesPortfolioSearch(objective, term));
  }

  /**
   * Tri portefeuille : en cours (haut) → terminés (100 %) → échus (bas).
   * Dans chaque groupe : échéance la plus proche en premier ; échus = plus anciens en bas.
   */
  get sortedObjectives(): ObjectiveItem[] {
    return [...this.filteredObjectives].sort((a, b) => {
      const groupDiff = this.portfolioSortGroup(a) - this.portfolioSortGroup(b);
      if (groupDiff !== 0) return groupDiff;

      const dueA = new Date(a.dueDate).getTime();
      const dueB = new Date(b.dueDate).getTime();
      const group = this.portfolioSortGroup(a);

      if (group === 2) {
        // Échus : les plus anciens tout en bas du tableau
        return dueB - dueA;
      }
      // En cours & terminés : échéance la plus proche en haut du groupe
      return dueA - dueB;
    });
  }

  /** 0 = en cours, 1 = terminé (100 %), 2 = échu */
  private portfolioSortGroup(objective: ObjectiveItem): number {
    if (objective.progress >= 100) return 1;
    const due = new Date(objective.dueDate).getTime();
    if (due < this.todayStart().getTime()) return 2;
    return 0;
  }

  get portfolioTotalPages(): number {
    return Math.max(1, Math.ceil(this.sortedObjectives.length / this.portfolioPageSize));
  }

  get pagedPortfolioObjectives(): ObjectiveItem[] {
    const safePage = Math.min(this.portfolioPage, this.portfolioTotalPages);
    const start = (safePage - 1) * this.portfolioPageSize;
    return this.sortedObjectives.slice(start, start + this.portfolioPageSize);
  }

  onPortfolioFilterChange(): void {
    this.portfolioPage = 1;
  }

  portfolioFirstPage(): void {
    this.portfolioPage = 1;
  }

  portfolioPreviousPage(): void {
    this.portfolioPage = Math.max(1, this.portfolioPage - 1);
  }

  portfolioNextPage(): void {
    this.portfolioPage = Math.min(this.portfolioTotalPages, this.portfolioPage + 1);
  }

  portfolioLastPage(): void {
    this.portfolioPage = this.portfolioTotalPages;
  }

  get onTrackPercent(): number {
    return this.percentByRisk('on_track');
  }

  get atRiskPercent(): number {
    return this.percentByRisk('at_risk');
  }

  get offTrackPercent(): number {
    return this.percentByRisk('off_track');
  }

  get weightedProgress(): number {
    const totalWeight = this.objectives.reduce((sum, objective) => sum + objective.weight, 0);
    if (!totalWeight) return 0;
    const weightedSum = this.objectives.reduce((sum, objective) => sum + objective.progress * objective.weight, 0);
    return Math.round(weightedSum / totalWeight);
  }

  get overdueMissedCount(): number {
    const today = this.todayStart();
    return this.objectives.filter((objective) => new Date(objective.dueDate) < today && objective.progress < 100).length;
  }

  /** Objectifs en cours uniquement — exclus des analyses une fois l'échéance dépassée. */
  get objectivesForAnalysis(): ObjectiveItem[] {
    return this.objectives.filter((objective) =>
      isActiveOkrForAnalysis(objective.dueDate, objective.progress)
    );
  }

  get filteredTeamMembers(): Employee[] {
    const q = this.teamMemberSearch.trim().toLowerCase();
    if (!q) return this.teamMembers;
    return this.teamMembers.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
    );
  }

  getMemberName(id: number): string {
    const m = this.teamMembers.find(m => m.employeeId === id);
    return m ? `${m.firstName} ${m.lastName}` : String(id);
  }

  get progressPreviewObjective(): ObjectiveItem | null {
    if (!this.selectedObjectiveId) return null;
    return this.objectives.find((o) => o.id === this.selectedObjectiveId) ?? null;
  }

  riskLabel(risk: string): string {
    if (risk === 'on_track') return 'On track';
    if (risk === 'at_risk') return 'At risk';
    return 'Off track';
  }

  riskClass(risk: string): string {
    if (risk === 'on_track') return 'risk-pill on-track';
    if (risk === 'at_risk') return 'risk-pill at-risk';
    return 'risk-pill off-track';
  }

  dependencyLabel(objective: ObjectiveItem): string {
    return objective.dependencies.length ? objective.dependencies.join(', ') : 'Aucune';
  }

  private matchesPortfolioSearch(objective: ObjectiveItem, term: string): boolean {
    if (!term) return true;
    const haystack = [
      objective.titre,
      objective.code,
      objective.proprietaire,
      this.ownerLabel(objective),
      ...(objective.memberNames ?? [])
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }

  /** Returns comma-separated owner names, truncated with ellipsis if >3 members. */
  ownerLabel(objective: ObjectiveItem): string {
    const names = objective.memberNames;
    if (!names || !names.length) return objective.proprietaire;
    if (names.length <= 3) return names.join(', ');
    return names.slice(0, 3).join(', ') + '\u2026';
  }

  onCreateObjective(): void {
    this.createValidationError = '';
    this.createError = '';
    this.createSuccess = '';

    if (!this.newObjectiveTitle.trim()) {
      this.createValidationError = 'Le titre est obligatoire.';
      return;
    }
    if (!this.managerEmployeeId) return;

    let ownerEmployeeId: number;
    let memberEmployeeIds: number[] | undefined;

    if (this.newObjectiveScope === 'INDIVIDUAL') {
      if (!this.newObjectiveOwnerEmployeeId) {
        this.createValidationError = 'Sélectionne un collaborateur pour cet objectif individuel.';
        return;
      }
      ownerEmployeeId = this.newObjectiveOwnerEmployeeId;
    } else {
      if (!this.newObjectiveTeamMemberIds.length) {
        this.createValidationError = "Sélectionne au moins un membre de l'équipe.";
        return;
      }
      ownerEmployeeId = this.newObjectiveTeamMemberIds[0];
      memberEmployeeIds = [...this.newObjectiveTeamMemberIds];
    }

    const payload: CreateObjectivePayload = {
      title: this.newObjectiveTitle.trim(),
      objectiveScope: this.newObjectiveScope,
      ownerEmployeeId,
      memberEmployeeIds,
      horizonLabel: this.newObjectiveHorizon.trim() || 'N/A',
      dueDate: this.newObjectiveDueDate || new Date().toISOString().slice(0, 10),
      progressPercent: 0,
      weighting: 1,
      dependencies: this.newObjectiveDependencies
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    };

    this.isCreating = true;
    this.managerOkrService.createObjective(this.managerEmployeeId, payload).subscribe({
      next: () => {
        this.isCreating = false;
        this.createSuccess = '';
        this.createError = '';
        this.newObjectiveTitle = '';
        this.newObjectiveDependencies = '';
        this.newObjectiveOwnerEmployeeId = null;
        this.ownerSearch = '';
        this.ownerDropdownOpen = false;
        this.newObjectiveTeamMemberIds = [];
        this.teamMemberSearch = '';
        this.loadDashboard();
        this.showToast('Objectif créé avec succès !');
      },
      error: (err: any) => {
        this.isCreating = false;
        this.showToast('Erreur !', 'error');
      }
    });
  }

  onSaveProgressComment(): void {
    this.progressSuccessMessage = '';
    this.progressErrorMessage = '';
    if (!this.selectedObjectiveId || !this.managerEmployeeId) return;
    this.managerOkrService.updateObjectiveProgress(this.managerEmployeeId, this.selectedObjectiveId, {
      authorEmployeeId: this.managerEmployeeId,
      progressPercent: this.quickProgress,
      commentText: this.quickComment.trim() || undefined
    }).subscribe({
      next: () => {
        this.quickComment = '';
        this.loadDashboard();
        this.showToast('Progression mise à jour.');
      },
      error: (err: any) => {
        this.showToast('Erreur !', 'error');
      }
    });
  }

  onCreateActionPlan(): void {
    const objectiveId = this.planObjectiveId ?? this.selectedObjectiveId;
    this.planSuccessMessage = '';
    this.planErrorMessage = '';
    if (!this.managerEmployeeId) return;
    if (!objectiveId) {
      this.planErrorMessage = 'Sélectionnez un objectif avant de créer le plan d\'action.';
      return;
    }
    this.managerOkrService.createActionPlan(this.managerEmployeeId, objectiveId, {
      actionType: this.actionPlanType,
      title: `Plan ${this.actionPlanType}`,
      details: this.planDescription || 'Créé depuis le portail manager.',
      ownerEmployeeId: this.managerEmployeeId,
      dueDate: this.planDueDate || undefined
    }).subscribe({
      next: () => {
        this.planDescription = '';
        this.planSuccessMessage = '';
        this.showToast('Plan d’action créé avec succès !');
      },
      error: (err: any) => {
        this.showToast('Erreur !', 'error');
      }
    });
  }

  fmtDate(date: string | null | undefined): string {
    if (!date) return '';
    const [y, m, d] = date.slice(0, 10).split('-');
    if (!y || !m || !d) return date;
    return `${d}/${m}/${y}`;
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'analyse') {
      setTimeout(() => this.renderRiskHeatmap(), 0);
    }
  }

  setActionTab(tab: string): void {
    this.activeActionTab = tab;
  }

  resetCreateForm(): void {
    this.newObjectiveTitle = '';
    this.newObjectiveHorizon = 'Q2 2026';
    this.newObjectiveScope = 'TEAM';
    this.newObjectiveDueDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    this.newObjectiveDependencies = '';
    this.newObjectiveDescription = '';
    this.newObjectiveOwnerEmployeeId = null;
    this.ownerSearch = '';
    this.ownerDropdownOpen = false;
    this.newObjectiveTeamMemberIds = [];
    this.teamMemberSearch = '';
  }

  onCsvFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.acceptImportFile(input.files[0]);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    this.acceptImportFile(file);
  }

  // ── Progress update helpers ──────────────────────────────────────────────────

  onSelectProgressObjective(id: number | null): void {
    this.selectedObjectiveId = id;
    const obj = this.objectives.find((o) => o.id === id) ?? null;
    this.quickProgress = obj ? obj.progress : 0;
  }

  onCancelProgressUpdate(): void {
    this.quickComment = '';
    const obj = this.objectives.find((o) => o.id === this.selectedObjectiveId) ?? null;
    this.quickProgress = obj ? obj.progress : 0;
  }

  onToggleTeamMember(id: number): void {
    const idx = this.newObjectiveTeamMemberIds.indexOf(id);
    if (idx === -1) {
      this.newObjectiveTeamMemberIds = [...this.newObjectiveTeamMemberIds, id];
    } else {
      this.newObjectiveTeamMemberIds = this.newObjectiveTeamMemberIds.filter(i => i !== id);
    }
  }

  removeTeamMember(id: number): void {
    this.newObjectiveTeamMemberIds = this.newObjectiveTeamMemberIds.filter(i => i !== id);
  }

  onTeamPickerBlur(): void {
    setTimeout(() => { this.teamPickerOpen = false; }, 150);
  }

  get filteredOwnerMembers(): Employee[] {
    const q = this.ownerSearch.trim().toLowerCase();
    if (!q) return this.teamMembers;
    return this.teamMembers.filter(m =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
    );
  }

  selectOwner(employeeId: number, firstName: string, lastName: string): void {
    this.newObjectiveOwnerEmployeeId = employeeId;
    this.ownerSearch = `${firstName} ${lastName}`.trim();
    this.ownerDropdownOpen = false;
  }

  clearOwner(): void {
    this.newObjectiveOwnerEmployeeId = null;
    this.ownerSearch = '';
    this.ownerDropdownOpen = false;
  }

  closeOwnerDropdown(): void {
    setTimeout(() => { this.ownerDropdownOpen = false; }, 150);
  }

  onOpenViewObjective(obj: ObjectiveItem): void {
    this.viewingObjective = obj;
  }

  onCloseViewObjective(): void {
    this.viewingObjective = null;
  }

  // ── Portfolio: edit / delete ────────────────────────────────────────────────

  onOpenEditObjective(obj: ObjectiveItem): void {
    this.editingObjective = obj;
    this.editTitle = obj.titre;
    this.editScope = obj.scope === 'Équipe' ? 'TEAM' : 'INDIVIDUAL';
    this.editOwnerId = obj.ownerEmployeeId;
    this.editHorizon = obj.horizon;
    this.editDueDate = obj.dueDate;
    this.editProgress = obj.progress;
    this.editDependencies = obj.dependencies.join(', ');
    this.editWeighting = obj.weight;
    this.editError = '';
  }

  onCloseEditObjective(): void {
    this.editingObjective = null;
    this.editError = '';
  }

  onSaveEditObjective(): void {
    if (!this.editingObjective || !this.managerEmployeeId) return;
    this.editLoading = true;
    this.editError = '';
    const payload: UpdateObjectivePayload = {
      title: this.editTitle,
      objectiveScope: this.editScope,
      ownerEmployeeId: this.editOwnerId || undefined,
      horizonLabel: this.editHorizon,
      dueDate: this.editDueDate || undefined,
      progressPercent: this.editProgress,
      weighting: this.editWeighting,
      dependencies: this.editDependencies.split(',').map((d) => d.trim()).filter(Boolean),
    };
    this.managerOkrService.updateObjective(this.managerEmployeeId, this.editingObjective.id, payload).subscribe({
      next: () => {
        this.editLoading = false;
        this.editingObjective = null;
        this.loadDashboard();
      },
      error: (err) => {
        this.editError = err?.error?.message ?? 'Erreur lors de la mise à jour.';
        this.editLoading = false;
      }
    });
  }

  onDeleteObjective(obj: ObjectiveItem): void {
    if (!this.managerEmployeeId) return;
    this.confirmDeleteObjective = obj;
    this.deleteError = '';
  }

  onConfirmDelete(): void {
    if (!this.confirmDeleteObjective || !this.managerEmployeeId) return;
    const obj = this.confirmDeleteObjective;
    this.deleteLoading = true;
    this.deleteError = '';
    this.managerOkrService.deleteObjective(this.managerEmployeeId, obj.id).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.confirmDeleteObjective = null;
        this.loadDashboard();
      },
      error: (err) => {
        this.deleteError = err?.error?.message ?? 'Erreur lors de la suppression.';
        this.deleteLoading = false;
      }
    });
  }

  onCancelDelete(): void {
    this.confirmDeleteObjective = null;
    this.deleteError = '';
  }

  // ── CSV Import ───────────────────────────────────────────────────────────────

  onRemoveCsvFile(): void {
    if (this.previewSub) {
      this.previewSub.unsubscribe();
      this.previewSub = undefined;
    }
    this.importLoading = false;
    this.csvFile = null;
    this.csvFileName = '';
    this.pendingRows = null;
    this.importError = '';
    this.importSuccess = '';
    this.importPage = 1;
    this.editingRowIdx = null;
    this.editingRow = null;
  }

  ngAfterViewInit(): void {
    if (this.activeTab === 'analyse') {
      setTimeout(() => this.renderRiskHeatmap(), 0);
    }
  }

  ngOnDestroy(): void {
    this.previewSub?.unsubscribe();
    this.destroyRiskHeatmap();
  }

  exportPortfolioExcel(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['Code', 'Titre', 'Propriétaire', 'Portée', 'Horizon', 'Échéance', 'Progression %', 'Statut risque', 'Dépendances'];
      const rows = this.sortedObjectives.map(o => [
        o.code,
        o.titre,
        this.ownerLabel(o),
        o.scope,
        o.horizon,
        o.dueDate,
        o.progress,
        this.riskLabel(o.risk),
        o.dependencies.join(', ')
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Portefeuille OKR');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `portefeuille-okr-${today}.xlsx`);
    });
  }

  /** Step 1: send file to backend for parse + validation, show preview table. */
  onSubmitPreview(): void {
    if (!this.csvFile || !this.managerEmployeeId) return;
    this.importLoading = true;
    this.importError = '';
    this.importSuccess = '';
    this.previewSub = this.managerOkrService.previewImport(this.managerEmployeeId, this.csvFile).subscribe({
      next: (result) => {
        this.pendingRows = result.rows;
        this.importPage = 1;
        this.importLoading = false;
        this.previewSub = undefined;
      },
      error: (err) => {
        this.importError = err?.error?.message ?? 'Impossible de prévisualiser le fichier.';
        this.importLoading = false;
        this.previewSub = undefined;
      }
    });
  }

  /** Pagination getters for preview table */
  get importTotalPages(): number {
    return Math.ceil((this.pendingRows?.length ?? 0) / this.importPageSize);
  }
  get pagedImportRows(): OkrImportRow[] {
    if (!this.pendingRows) return [];
    const start = (this.importPage - 1) * this.importPageSize;
    return this.pendingRows.slice(start, start + this.importPageSize);
  }
  prevImportPage(): void { if (this.importPage > 1) this.importPage--; }
  nextImportPage(): void { if (this.importPage < this.importTotalPages) this.importPage++; }

  /** Open inline edit for a row */
  onEditImportRow(idx: number): void {
    const globalIdx = (this.importPage - 1) * this.importPageSize + idx;
    this.editingRowIdx = globalIdx;
    this.editingRow = { ...this.pendingRows![globalIdx] };
  }
  onSaveImportEdit(): void {
    if (this.editingRowIdx === null || !this.editingRow || !this.pendingRows) return;
    // Re-validate client-side (simple checks)
    const errors: string[] = [];
    if (!this.editingRow.title?.trim()) errors.push('Titre obligatoire.');
    if (!this.editingRow.ownerEmployeeId) errors.push('owner_employee_id requis.');
    this.editingRow.valid = errors.length === 0;
    this.editingRow.errors = errors;
    this.pendingRows[this.editingRowIdx] = { ...this.editingRow };
    this.editingRowIdx = null;
    this.editingRow = null;
  }
  onCancelImportEdit(): void { this.editingRowIdx = null; this.editingRow = null; }
  onDeleteImportRow(idx: number): void {
    if (!this.pendingRows) return;
    const globalIdx = (this.importPage - 1) * this.importPageSize + idx;
    this.pendingRows = this.pendingRows.filter((_, i) => i !== globalIdx);
    if (this.importPage > this.importTotalPages && this.importPage > 1) this.importPage--;
  }

  /** Step 2: commit validated rows to DB */
  onConfirmImport(): void {
    if (!this.pendingRows || !this.managerEmployeeId) return;
    const validRows = this.pendingRows.filter(r => r.valid);
    if (!validRows.length) {
      this.importError = 'Aucune ligne valide à importer. Corrigez ou supprimez les lignes en erreur.';
      return;
    }
    this.importLoading = true;
    this.importError = '';
    this.importSuccess = '';
    this.managerOkrService.commitImport(this.managerEmployeeId, validRows).subscribe({
      next: (summary) => {
        this.importSuccess = `${summary.insertedRows} objectif(s) importé(s) avec succès.`
          + (summary.skippedRows > 0 ? ` ${summary.skippedRows} ligne(s) ignorée(s).` : '');
        this.pendingRows = null;
        this.csvFile = null;
        this.csvFileName = '';
        this.importPage = 1;
        this.importLoading = false;
        this.loadDashboard();
        this.isImportModalOpen = false;
        this.setTab('portefeuille');
      },
      error: (err) => {
        this.importError = err?.error?.message ?? 'Erreur lors de l\'import.';
        this.importLoading = false;
      }
    });
  }

  openImportModal(): void {
    this.isImportModalOpen = true;
  }

  closeImportModal(): void {
    this.onRemoveCsvFile();
    this.isImportModalOpen = false;
  }

  /** Import direct sans prévisualisation : preview → commit enchaînés automatiquement. */
  onDirectImport(): void {
    if (!this.csvFile || !this.managerEmployeeId) return;
    this.importLoading = true;
    this.importError = '';
    this.importSuccess = '';
    this.previewSub = this.managerOkrService.previewImport(this.managerEmployeeId, this.csvFile).subscribe({
      next: (result) => {
        const validRows = result.rows.filter(r => r.valid);
        if (!validRows.length) {
          this.importError = 'Aucune ligne valide dans le fichier. Vérifiez le format et les données.';
          this.importLoading = false;
          this.previewSub = undefined;
          return;
        }
        this.managerOkrService.commitImport(this.managerEmployeeId!, validRows).subscribe({
          next: (summary) => {
            this.importSuccess = `${summary.insertedRows} objectif(s) importé(s) avec succès.`
              + (summary.skippedRows > 0 ? ` ${summary.skippedRows} ligne(s) ignorée(s).` : '');
            this.importLoading = false;
            this.loadDashboard();
            setTimeout(() => {
              this.isImportModalOpen = false;
              this.onRemoveCsvFile();
              this.setTab('portefeuille');
            }, 1200);
          },
          error: (err) => {
            this.importError = err?.error?.message ?? 'Erreur lors de l\'import.';
            this.importLoading = false;
          }
        });
        this.previewSub = undefined;
      },
      error: (err) => {
        this.importError = err?.error?.message ?? 'Impossible de lire le fichier.';
        this.importLoading = false;
        this.previewSub = undefined;
      }
    });
  }

  onDownloadCsvTemplate(): void {
    const header = 'titre,scope,owner_employee_id,horizon,created_at,due_date,progress,weighting,dependencies';
    const example = 'Réduire le délai de validation des congés,EQUIPE,12;15;18,Q2,2025-01-15,2025-06-30,45,1,';
    const content = header + '\n' + example + '\n';
    // No BOM — UTF-8 plain
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-objectifs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private acceptImportFile(file: File): void {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      this.importError = 'Format non supporté. Utilisez .xlsx, .xls ou .csv.';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.importError = 'Fichier trop volumineux (max 10 Mo).';
      return;
    }
    this.csvFile = file;
    this.csvFileName = file.name;
    this.pendingRows = null;
    this.importError = '';
    this.importSuccess = '';
  }

  onNotifications(): void {}

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil(): void {
    this.router.navigate(['/profil']);
  }

  private percentByRisk(risk: string): number {
    const active = this.objectivesForAnalysis;
    if (!active.length) return 0;
    const count = active.filter((objective) => objective.risk === risk).length;
    return Math.round((count / active.length) * 100);
  }

  private proximityBucket(dueDate: string): string {
    const today = this.todayStart();
    const due = new Date(dueDate);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 14) return '<= 14 jours';
    if (diffDays <= 30) return '15-30 jours';
    return '> 30 jours';
  }

  private delayBucket(delay: number): string {
    if (delay >= 10) return 'Élevé';
    if (delay >= 4) return 'Moyen';
    return 'Faible';
  }

  private todayStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private showToast(message: string, type: 'success' | 'error' = 'success', duration = 5000): void {
    if (this._toastTimer) { clearTimeout(this._toastTimer); }
    this.toastMessage = message;
    this.toastType = type;
    this.toastVisible = true;
    this._toastTimer = setTimeout(() => {
      this.toastVisible = false;
      this.toastMessage = '';
    }, duration);
  }

  private loadDashboard(): void {
    if (!this.managerEmployeeId) return;
    this.isLoading = true;
    this.loadError = '';
    this.managerOkrService.getDashboard(this.managerEmployeeId).subscribe({
      next: (dashboard) => {
        this.objectives = dashboard.objectives.map((objective) => this.mapObjective(objective));
        if (!this.selectedObjectiveId && this.objectives.length) {
          this.selectedObjectiveId = this.objectives[0].id;
        }
        if (this.selectedObjectiveId && !this.objectives.some((objective) => objective.id === this.selectedObjectiveId)) {
          this.selectedObjectiveId = this.objectives.length ? this.objectives[0].id : null;
        }
        this.portfolioPage = Math.min(this.portfolioPage, this.portfolioTotalPages);
        this.isLoading = false;
        if (this.activeTab === 'analyse') {
          setTimeout(() => this.renderRiskHeatmap(), 0);
        }
      },
      error: () => {
        this.objectives = [];
        this.loadError = 'Impossible de charger les objectifs.';
        this.isLoading = false;
        if (this.activeTab === 'analyse') {
          setTimeout(() => this.renderRiskHeatmap(), 0);
        }
      }
    });
  }

  private buildHeatmapMatrixData(): HeatmapMatrixPoint[] {
    const points: HeatmapMatrixPoint[] = [];
    for (const proximity of HEATMAP_PROXIMITY_LABELS) {
      for (const delay of HEATMAP_DELAY_LABELS) {
        const count = this.objectivesForAnalysis.filter((objective) => (
          this.proximityBucket(objective.dueDate) === proximity &&
          this.delayBucket(objective.retardDays) === delay
        )).length;
        points.push({ x: delay, y: proximity, v: count });
      }
    }
    return points;
  }

  private heatmapCellColor(count: number, hover = false): string {
    if (count >= 2) return hover ? '#fecaca' : '#fee2e2';
    if (count === 1) return hover ? '#fde68a' : '#fef3c7';
    return hover ? '#f1f5f9' : '#f8fafc';
  }

  private renderRiskHeatmap(): void {
    const canvas = this.riskHeatmapCanvas?.nativeElement;
    if (!canvas || this.activeTab !== 'analyse') return;

    const matrixData = this.buildHeatmapMatrixData();

    if (this.riskHeatmapChart) {
      const dataset = this.riskHeatmapChart.data.datasets[0];
      dataset.data = matrixData;
      dataset.backgroundColor = matrixData.map((point) => this.heatmapCellColor(point.v));
      dataset.hoverBackgroundColor = matrixData.map((point) => this.heatmapCellColor(point.v, true));
      this.riskHeatmapChart.update();
      return;
    }

    const config: ChartConfiguration<'matrix'> = {
      type: 'matrix',
      data: {
        datasets: [{
          label: 'Objectifs',
          data: matrixData,
          backgroundColor: matrixData.map((point) => this.heatmapCellColor(point.v)),
          hoverBackgroundColor: matrixData.map((point) => this.heatmapCellColor(point.v, true)),
          borderColor: '#e2e8f0',
          borderWidth: 1,
          borderRadius: 10,
          hoverBorderColor: '#cbd5e1',
          width: ({ chart }) => {
            const area = chart.chartArea;
            if (!area) return 20;
            return area.width / HEATMAP_DELAY_LABELS.length - 6;
          },
          height: ({ chart }) => {
            const area = chart.chartArea;
            if (!area) return 20;
            return area.height / HEATMAP_PROXIMITY_LABELS.length - 6;
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: () => '',
              label: (ctx) => {
                const raw = ctx.raw as HeatmapMatrixPoint;
                return `${raw.y} · Retard ${raw.x.toLowerCase()} : ${raw.v} objectif${raw.v > 1 ? 's' : ''}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'category',
            labels: [...HEATMAP_DELAY_LABELS],
            offset: true,
            grid: { display: false },
            border: { display: false },
            title: {
              display: true,
              text: 'Niveau de retard',
              color: '#6b7280',
              font: { size: 10, weight: 'bold' },
              padding: { top: 4 }
            },
            ticks: {
              color: '#9ca3af',
              font: { size: 11, weight: 'bold' }
            }
          },
          y: {
            type: 'category',
            labels: [...HEATMAP_PROXIMITY_LABELS],
            reverse: true,
            offset: true,
            grid: { display: false },
            border: { display: false },
            title: {
              display: true,
              text: 'Proximité échéance',
              color: '#6b7280',
              font: { size: 10, weight: 'bold' },
              padding: { bottom: 4 }
            },
            ticks: {
              color: '#4b5563',
              font: { size: 11, weight: 'bold' },
              padding: 6
            }
          }
        }
      },
      plugins: [heatmapCellLabelsPlugin]
    };

    this.riskHeatmapChart = new Chart(canvas, config);
  }

  private destroyRiskHeatmap(): void {
    this.riskHeatmapChart?.destroy();
    this.riskHeatmapChart = null;
  }

  private loadCrossAnalysis(): void {
    if (!this.managerEmployeeId) return;
    this.crossAnalysisService.getCrossAnalysis(this.managerEmployeeId).subscribe({
      next: (data) => {
        this.crossImpacts = (data.objectiveAbsenceImpacts ?? []).filter((impact) =>
          isActiveOkrForAnalysis(impact.dueDate, impact.progressPercent ?? 0)
        );
      },
      error: () => { this.crossImpacts = []; }
    });
  }

  private loadContinuityPlans(): void {
    if (!this.managerEmployeeId) return;
    this.advancedAbsencesService.getContinuityPlans(this.managerEmployeeId).subscribe({
      next: (plans) => { this.continuityPlans = plans ?? []; },
      error: () => { this.continuityPlans = []; }
    });
  }

  isCrossImpactTreated(impact: ObjectiveAbsenceImpactItem): boolean {
    if (!impact.affectedMembers?.length) return false;
    const treatedRequestIds = new Set(this.continuityPlans.map(p => p.requestId));
    return impact.affectedMembers.every(m => treatedRequestIds.has(m.relatedRequestId));
  }

  get sortedCrossImpacts(): ObjectiveAbsenceImpactItem[] {
    const untreated = this.crossImpacts.filter(i => !this.isCrossImpactTreated(i));
    const treated   = this.crossImpacts.filter(i =>  this.isCrossImpactTreated(i));
    return [...untreated, ...treated];
  }

  getPrimaryRequestId(impact: ObjectiveAbsenceImpactItem): number | null {
    return impact.affectedMembers?.[0]?.relatedRequestId ?? null;
  }

  isImpactBackupAssigned(impact: ObjectiveAbsenceImpactItem): boolean {
    const requestId = this.getPrimaryRequestId(impact);
    if (requestId == null) return false;
    return this.continuityPlans.some(p => p.requestId === requestId);
  }

  getImpactBackupName(impact: ObjectiveAbsenceImpactItem): string | null {
    const requestId = this.getPrimaryRequestId(impact);
    if (requestId == null) return null;
    return this.continuityPlans.find(p => p.requestId === requestId)?.backupEmployeeName ?? null;
  }

  crossImpactOwnerLabel(impact: ObjectiveAbsenceImpactItem): string {
    return impact.affectedMembers?.[0]?.employeeName ?? '—';
  }

  crossImpactTypeLabel(impact: ObjectiveAbsenceImpactItem): string {
    return impact.scope === 'TEAM' ? 'équipe' : 'tache';
  }

  crossImpactReason(_impact: ObjectiveAbsenceImpactItem): string {
    return "échéance pendant l'absence du propriétaire";
  }

  crossImpactAbsenceStart(impact: ObjectiveAbsenceImpactItem): string | null {
    return impact.affectedMembers?.[0]?.absenceStart ?? null;
  }

  crossImpactAbsenceEnd(impact: ObjectiveAbsenceImpactItem): string | null {
    return impact.affectedMembers?.[0]?.absenceEnd ?? null;
  }

  navigateToAbsencePlan(impact: ObjectiveAbsenceImpactItem): void {
    const requestId = this.getPrimaryRequestId(impact);
    if (requestId == null) return;
    this.router.navigate(['/manager/absences-avancees'], {
      queryParams: { tab: 'actions', requestId, actionPanel: 'plan' }
    });
  }

  navigateToAbsenceAlt(impact: ObjectiveAbsenceImpactItem): void {
    const requestId = this.getPrimaryRequestId(impact);
    if (requestId == null) return;
    this.router.navigate(['/manager/absences-avancees'], {
      queryParams: { tab: 'actions', requestId, actionPanel: 'alt' }
    });
  }

  viewImpactObjective(impact: ObjectiveAbsenceImpactItem): void {
    const objective = this.objectives.find(o => o.id === impact.objectiveId);
    if (objective) {
      this.onOpenViewObjective(objective);
      return;
    }
    this.highlightedObjectiveId = impact.objectiveId;
  }

  private scrollToAbsencesCapacitePanel(): void {
    document.getElementById('absences-capacite-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private mapObjective(objective: ManagerObjective): ObjectiveItem {
    return {
      id: objective.objectiveId,
      code: objective.objectiveCode,
      ownerEmployeeId: objective.ownerEmployeeId,
      titre: objective.title,
      scope: objective.objectiveScope === 'TEAM' ? 'Équipe' : 'Individuel',
      proprietaire: objective.memberNames?.length ? objective.memberNames.join(', ') : objective.ownerName,
      memberNames: objective.memberNames ?? [objective.ownerName],
      equipe: objective.teamName,
      horizon: objective.horizonLabel,
      dueDate: objective.dueDate,
      progress: objective.progressPercent,
      weight: objective.weighting,
      risk: this.mapRisk(objective.riskStatus),
      retardDays: objective.delayDays,
      dependencies: objective.dependencies ?? [],
      lastUpdate: objective.lastUpdateAt ? objective.lastUpdateAt.slice(0, 10) : '',
      note: objective.riskReason ?? undefined
    };
  }

  private mapRisk(status: ObjectiveRiskStatus): 'on_track' | 'at_risk' | 'off_track' {
    if (status === 'ON_TRACK') return 'on_track';
    if (status === 'OFF_TRACK') return 'off_track';
    return 'at_risk';
  }

}

