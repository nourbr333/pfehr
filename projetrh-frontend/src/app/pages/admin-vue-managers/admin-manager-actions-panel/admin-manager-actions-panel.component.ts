import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ManagerService, ManagerTeamMember, Evaluation } from '../../../services/manager.service';
import { EmployeeService, Employee } from '../../../services/employee.service';
import { NotificationService, CreateNotificationPayload } from '../../../services/notification.service';
import { ToastService } from '../../../components/toast/toast.service';
import {
  ManagerOkrService,
  ManagerObjective
} from '../../../services/manager-okr.service';
import {
  ManagerAdvancedAbsencesService,
  AdvancedAbsenceDashboard,
  PipelineRequestItem,
  SuggestedAlternative
} from '../../../services/manager-advanced-absences.service';

type ManagerTab = 'equipe' | 'objectifs' | 'absences' | 'evaluations';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-admin-manager-actions-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-manager-actions-panel.component.html',
  styleUrl: './admin-manager-actions-panel.component.scss'
})
export class AdminManagerActionsPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) managerId!: number;
  @Input({ required: true }) managerName = '';

  activeTab: ManagerTab = 'equipe';
  readonly pageSize = PAGE_SIZE;

  // ── Équipe ──────────────────────────────────────────────────────────
  team: ManagerTeamMember[] = [];
  teamLoading = false;
  teamPage = 1;
  removeConfirmId: string | null = null;
  isRemoving = false;

  showInviteModal = false;
  inviteSearch = '';
  allEmployees: Employee[] = [];
  inviteFiltered: Employee[] = [];
  isInviting = false;
  inviteFeedback = '';
  inviteError = '';

  // ── Objectifs (OKR) ───────────────────────────────────────────────────
  objectivesLoading = false;
  objectives: ManagerObjective[] = [];
  objectivesPage = 1;

  updatingObjectiveId: number | null = null;
  progressValue = 0;
  progressComment = '';
  isSavingProgress = false;

  deleteObjectiveConfirmId: number | null = null;
  isDeletingObjective = false;

  // ── Absences ────────────────────────────────────────────────────────
  absencesLoading = false;
  absenceDashboard: AdvancedAbsenceDashboard | null = null;
  absencesPage = 1;
  suggestingRequestId: number | null = null;
  suggestions: SuggestedAlternative[] = [];
  isSuggesting = false;

  planModalRequest: PipelineRequestItem | null = null;
  planBackupEmployeeId: number | null = null;
  planNotes = '';
  isSavingPlan = false;

  // ── Évaluations ─────────────────────────────────────────────────────
  evalPage = 1;
  evalModalMember: ManagerTeamMember | null = null;
  editingEvaluationId: number | null = null;
  evalForm = {
    score: 70,
    date: new Date().toISOString().slice(0, 10),
    objectifs: '',
    commentaire: ''
  };
  isSavingEval = false;
  deleteEvalConfirmId: number | null = null;

  private subs = new Subscription();

  constructor(
    private managerService: ManagerService,
    private employeeService: EmployeeService,
    private notificationService: NotificationService,
    private managerOkrService: ManagerOkrService,
    private absencesService: ManagerAdvancedAbsencesService,
    private toast: ToastService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['managerId']) {
      this.activeTab = 'equipe';
      this.teamPage = 1;
      this.objectivesPage = 1;
      this.absencesPage = 1;
      this.evalPage = 1;
      this.loadTeam();
      this.objectives = [];
      this.absenceDashboard = null;
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setTab(tab: ManagerTab): void {
    this.activeTab = tab;
    if (tab === 'objectifs' && this.objectives.length === 0) this.loadObjectives();
    if (tab === 'absences' && !this.absenceDashboard) this.loadAbsences();
    if (tab === 'evaluations' && this.team.length === 0) this.loadTeam();
  }

  // ── Pagination générique ───────────────────────────────────────────

  private paged<T>(items: T[], page: number): T[] {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }

  private totalPages(length: number): number {
    return Math.max(1, Math.ceil(length / PAGE_SIZE));
  }

  get pagedTeam(): ManagerTeamMember[] {
    return this.paged(this.team, this.teamPage);
  }

  get teamTotalPages(): number {
    return this.totalPages(this.team.length);
  }

  goToTeamPage(page: number): void {
    if (page >= 1 && page <= this.teamTotalPages) this.teamPage = page;
  }

  get pagedObjectives(): ManagerObjective[] {
    return this.paged(this.objectives, this.objectivesPage);
  }

  get objectivesTotalPages(): number {
    return this.totalPages(this.objectives.length);
  }

  goToObjectivesPage(page: number): void {
    if (page >= 1 && page <= this.objectivesTotalPages) this.objectivesPage = page;
  }

  get pagedPendingAbsences(): PipelineRequestItem[] {
    return this.paged(this.pendingAbsenceRequests, this.absencesPage);
  }

  get absencesTotalPages(): number {
    return this.totalPages(this.pendingAbsenceRequests.length);
  }

  goToAbsencesPage(page: number): void {
    if (page >= 1 && page <= this.absencesTotalPages) this.absencesPage = page;
  }

  get pagedEvalTeam(): ManagerTeamMember[] {
    return this.paged(this.team, this.evalPage);
  }

  get evalTotalPages(): number {
    return this.totalPages(this.team.length);
  }

  goToEvalPage(page: number): void {
    if (page >= 1 && page <= this.evalTotalPages) this.evalPage = page;
  }

  // ── Équipe ──────────────────────────────────────────────────────────

  private loadTeam(): void {
    this.teamLoading = true;
    this.subs.add(
      this.managerService.loadTeamForManager(this.managerId).pipe(
        finalize(() => { this.teamLoading = false; })
      ).subscribe({
        next: (members) => { this.team = members; },
        error: () => this.toast.error('Impossible de charger l\u2019équipe de ce manager.')
      })
    );
  }

  memberId(member: ManagerTeamMember): number {
    return Number(member.id);
  }

  latestEvaluation(member: ManagerTeamMember): Evaluation | null {
    const evaluations = this.managerService.getEvaluationsFor(member.id);
    if (!evaluations.length) return null;
    return [...evaluations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }

  askRemove(member: ManagerTeamMember): void {
    this.removeConfirmId = member.id;
  }

  cancelRemove(): void {
    this.removeConfirmId = null;
  }

  confirmRemove(member: ManagerTeamMember): void {
    this.isRemoving = true;
    const employeeId = Number(member.id);
    this.employeeService.updateEmployee(employeeId, { managerId: null }).pipe(
      finalize(() => { this.isRemoving = false; })
    ).subscribe({
      next: () => {
        this.team = this.team.filter((m) => m.id !== member.id);
        this.managerService.deleteMember(member.id);
        this.removeConfirmId = null;
        this.toast.success(`${member.name} retiré de l\u2019équipe.`);
      },
      error: () => {
        this.toast.error('Impossible de retirer ce collaborateur.');
        this.removeConfirmId = null;
      }
    });
  }

  openInviteModal(): void {
    this.inviteSearch = '';
    this.inviteFeedback = '';
    this.inviteError = '';
    this.showInviteModal = true;
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.allEmployees = employees;
        this.filterInviteList();
      },
      error: () => { this.allEmployees = []; }
    });
  }

  closeInviteModal(): void {
    if (this.isInviting) return;
    this.showInviteModal = false;
  }

  filterInviteList(): void {
    const term = this.inviteSearch.trim().toLowerCase();
    const currentIds = new Set(this.team.map((m) => Number(m.id)));
    this.inviteFiltered = this.allEmployees
      .filter((e) => !currentIds.has(e.employeeId))
      .filter((e) => {
        if (!term) return true;
        return `${e.firstName} ${e.lastName}`.toLowerCase().includes(term);
      })
      .slice(0, 10);
  }

  inviteEmployee(employee: Employee): void {
    this.isInviting = true;
    this.inviteError = '';
    this.inviteFeedback = '';
    const empName = `${employee.firstName} ${employee.lastName}`.trim();

    const payload: CreateNotificationPayload = {
      type: 'invitation_equipe',
      title: 'Invitation équipe',
      message: `L\u2019admin souhaite intégrer ${empName} à l\u2019équipe de ${this.managerName}.`,
      recipientId: null,
      targetRole: 'RESPONSABLE_RH',
      sourceTable: 'employees',
      sourceId: Number(employee.employeeId),
      targetUrl: `/employes?employeeId=${employee.employeeId}&manager=${this.managerId}`
    };

    this.notificationService.createNotification(payload).pipe(
      finalize(() => { this.isInviting = false; })
    ).subscribe({
      next: () => {
        this.inviteFeedback = `Demande envoyée pour ${empName}.`;
        this.filterInviteList();
        this.notificationService.refresh();
      },
      error: () => { this.inviteError = 'Envoi impossible. Réessayez.'; }
    });
  }

  // ── Objectifs (OKR) ───────────────────────────────────────────────────

  private loadObjectives(): void {
    this.objectivesLoading = true;
    this.subs.add(
      this.managerOkrService.getDashboard(this.managerId).pipe(
        finalize(() => { this.objectivesLoading = false; })
      ).subscribe({
        next: (dashboard) => { this.objectives = dashboard.objectives; },
        error: () => this.toast.error('Impossible de charger les objectifs.')
      })
    );
  }

  progressClass(percent: number): string {
    if (percent >= 70) return 'progress-fill progress-fill-green';
    if (percent >= 40) return 'progress-fill progress-fill-orange';
    return 'progress-fill progress-fill-red';
  }

  clampPercent(percent: number): number {
    return Math.max(0, Math.min(100, percent ?? 0));
  }

  openProgressUpdate(objective: ManagerObjective): void {
    this.updatingObjectiveId = objective.objectiveId;
    this.progressValue = objective.progressPercent;
    this.progressComment = '';
  }

  cancelProgressUpdate(): void {
    this.updatingObjectiveId = null;
  }

  saveProgressUpdate(objective: ManagerObjective): void {
    this.isSavingProgress = true;
    this.managerOkrService.updateObjectiveProgress(this.managerId, objective.objectiveId, {
      authorEmployeeId: objective.ownerEmployeeId,
      progressPercent: this.progressValue,
      commentText: this.progressComment || undefined
    }).pipe(
      finalize(() => { this.isSavingProgress = false; })
    ).subscribe({
      next: (updated) => {
        this.objectives = this.objectives.map((o) => o.objectiveId === updated.objectiveId ? updated : o);
        this.updatingObjectiveId = null;
        this.toast.success('Avancement mis à jour.');
      },
      error: () => this.toast.error('Mise à jour impossible.')
    });
  }

  askDeleteObjective(objective: ManagerObjective): void {
    this.deleteObjectiveConfirmId = objective.objectiveId;
  }

  cancelDeleteObjective(): void {
    this.deleteObjectiveConfirmId = null;
  }

  confirmDeleteObjective(objective: ManagerObjective): void {
    this.isDeletingObjective = true;
    this.managerOkrService.deleteObjective(this.managerId, objective.objectiveId).pipe(
      finalize(() => { this.isDeletingObjective = false; })
    ).subscribe({
      next: () => {
        this.objectives = this.objectives.filter((o) => o.objectiveId !== objective.objectiveId);
        this.deleteObjectiveConfirmId = null;
        this.toast.success('Objectif supprimé.');
      },
      error: () => this.toast.error('Suppression impossible.')
    });
  }

  // ── Absences ────────────────────────────────────────────────────────

  private loadAbsences(): void {
    this.absencesLoading = true;
    const today = new Date().toISOString().slice(0, 10);
    this.subs.add(
      this.absencesService.getDashboard(this.managerId, 'monthly', today, 2).pipe(
        finalize(() => { this.absencesLoading = false; })
      ).subscribe({
        next: (dashboard) => { this.absenceDashboard = dashboard; },
        error: () => this.toast.error('Impossible de charger les absences.')
      })
    );
  }

  get pendingAbsenceRequests(): PipelineRequestItem[] {
    return (this.absenceDashboard?.pipeline?.requests ?? []).filter((r) => r.status === 'en_attente');
  }

  suggestAlternatives(request: PipelineRequestItem): void {
    this.suggestingRequestId = request.requestId;
    this.suggestions = [];
    this.isSuggesting = true;
    this.absencesService.suggestAlternatives(this.managerId, { requestId: request.requestId }).pipe(
      finalize(() => { this.isSuggesting = false; })
    ).subscribe({
      next: (response) => { this.suggestions = response.alternatives; },
      error: () => this.toast.error('Aucune alternative disponible.')
    });
  }

  closeSuggestions(): void {
    this.suggestingRequestId = null;
    this.suggestions = [];
  }

  openPlanModal(request: PipelineRequestItem): void {
    this.planModalRequest = request;
    this.planBackupEmployeeId = null;
    this.planNotes = '';
  }

  closePlanModal(): void {
    if (this.isSavingPlan) return;
    this.planModalRequest = null;
  }

  savePlan(): void {
    if (!this.planModalRequest) return;
    this.isSavingPlan = true;
    this.absencesService.createContinuityPlan(this.managerId, {
      requestId: this.planModalRequest.requestId,
      backupEmployeeId: this.planBackupEmployeeId ?? undefined,
      notes: this.planNotes || undefined
    }).pipe(
      finalize(() => { this.isSavingPlan = false; })
    ).subscribe({
      next: () => {
        this.toast.success('Plan de continuité enregistré.');
        this.planModalRequest = null;
      },
      error: () => this.toast.error('Enregistrement du plan impossible.')
    });
  }

  // ── Évaluations (modification / suppression uniquement — pas de création côté admin) ──

  openEvalModal(member: ManagerTeamMember): void {
    const existing = this.latestEvaluation(member);
    if (!existing || existing.evaluationId == null) return;
    this.evalModalMember = member;
    this.editingEvaluationId = existing.evaluationId;
    this.evalForm = {
      score: existing.score,
      date: existing.date || new Date().toISOString().slice(0, 10),
      objectifs: existing.objectifs || '',
      commentaire: existing.commentaire || ''
    };
  }

  closeEvalModal(): void {
    if (this.isSavingEval) return;
    this.evalModalMember = null;
    this.editingEvaluationId = null;
  }

  saveEval(): void {
    if (!this.evalModalMember || this.editingEvaluationId == null) return;
    const member = this.evalModalMember;
    const evaluation: Evaluation = {
      date: this.evalForm.date,
      score: this.evalForm.score,
      evaluateur: this.managerName,
      commentaire: this.evalForm.commentaire,
      objectifs: this.evalForm.objectifs
    };
    this.isSavingEval = true;
    this.managerService.updateEvaluation(member.id, this.editingEvaluationId, this.managerId, evaluation).pipe(
      finalize(() => { this.isSavingEval = false; })
    ).subscribe({
      next: () => {
        this.toast.success(`Évaluation de ${member.name} modifiée.`);
        this.evalModalMember = null;
        this.editingEvaluationId = null;
      },
      error: () => this.toast.error('Impossible de modifier cette évaluation.')
    });
  }

  askDeleteEval(evaluation: Evaluation): void {
    this.deleteEvalConfirmId = evaluation.evaluationId ?? null;
  }

  cancelDeleteEval(): void {
    this.deleteEvalConfirmId = null;
  }

  confirmDeleteEval(member: ManagerTeamMember, evaluation: Evaluation): void {
    if (!evaluation.evaluationId) return;
    this.managerService.deleteEvaluation(member.id, evaluation.evaluationId).subscribe({
      next: () => {
        this.toast.success('Évaluation supprimée.');
        this.deleteEvalConfirmId = null;
      },
      error: () => this.toast.error('Suppression impossible.')
    });
  }
}
