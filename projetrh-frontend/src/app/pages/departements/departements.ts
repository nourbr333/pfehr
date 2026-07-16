import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AuthService, Utilisateur } from '../../services/auth';
import {
  Department,
  DepartmentCreatePayload,
  DepartmentEmployee,
  DepartmentService,
  DepartmentStats,
  DepartmentUpdatePayload
} from '../../services/department.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

type DepartmentFormMode = 'create' | 'edit';

interface DepartmentFormState {
  departmentName: string;
  departmentHead: string;
  description: string;
  active: boolean;
}

type DepartmentPanelTab = 'members' | 'kpis' | 'notes';

interface DepartmentNote {
  id: number;
  content: string;
  createdAt: string;
}

interface DepartmentKpiSpotlight {
  departmentName: string;
  score: number;
}

@Component({
  selector: 'app-departements',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './departements.html',
  styleUrl: './departements.scss'
})
export class DepartementsComponent implements OnInit {
  utilisateur: Utilisateur | null;
  departments: Department[] = [];
  departmentStatsById: Record<number, DepartmentStats> = {};
  searchTerm = '';
  isLoading = false;
  errorMessage = '';
  isDepartmentPanelOpen = false;
  selectedDepartment: Department | null = null;
  departmentEmployees: DepartmentEmployee[] = [];
  departmentEmployeesLoading = false;
  departmentEmployeesError = '';
  activeDepartmentTab: DepartmentPanelTab = 'members';
  membersSearchTerm = '';
  private departmentNotes: Record<number, DepartmentNote[]> = {};
  noteDraft = '';
  noteEditingId: number | null = null;
  notePendingDeleteId: number | null = null;
  noteSavedMessage = '';

  actionSuccessMessage = '';
  actionErrorMessage = '';

  showDepartmentFormModal = false;
  departmentFormMode: DepartmentFormMode = 'create';
  departmentBeingEdited: Department | null = null;
  departmentForm: DepartmentFormState = { departmentName: '', departmentHead: '', description: '', active: true };
  isSavingDepartment = false;
  departmentFormError = '';

  showDeleteDepartmentModal = false;
  departmentToDelete: Department | null = null;
  isDeletingDepartment = false;

  constructor(
    private router: Router,
    private auth: AuthService,
    private departmentService: DepartmentService
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit() {
    this.loadSavedNotes();
    this.loadDepartments();
  }

  loadDepartments() {
    this.isLoading = true;
    this.errorMessage = '';

    this.departmentService.getAllDepartments().subscribe({
      next: (data) => {
        this.departments = (data ?? []).map((d: any) => ({
          departmentId: d.departmentId ?? d.department_id ?? 0,
          departmentName: d.departmentName ?? d.department_name ?? 'Non renseigné',
          departmentHead: d.departmentHead ?? d.department_head ?? 'Non renseigné',
          employeeCount: d.employeeCount ?? d.employee_count ?? 0,
          description: d.description ?? null,
          active: d.active ?? d.isActive ?? true
        }));
        this.loadDepartmentStats();
        this.isLoading = false;
      },
      error: () => {
        this.departments = [];
        this.departmentStatsById = {};
        this.errorMessage = 'Impossible de charger les départements.';
        this.isLoading = false;
      }
    });
  }

  loadDepartmentStats() {
    this.departmentService.getAllDepartmentStats().subscribe({
      next: (statsRows) => {
        const byId: Record<number, DepartmentStats> = {};
        (statsRows ?? []).forEach((row: any) => {
          const departmentId = Number(row.departmentId ?? row.department_id ?? 0);
          byId[departmentId] = {
            departmentId,
            departmentName: row.departmentName ?? row.department_name ?? '',
            employeeCount: Number(row.employeeCount ?? row.employee_count ?? 0),
            evaluatedEmployees: Number(row.evaluatedEmployees ?? row.evaluated_employees ?? 0),
            averagePerformanceScore: Number(row.averagePerformanceScore ?? row.average_performance_score ?? 0),
            averageAttendanceRate: Number(row.averageAttendanceRate ?? row.average_attendance_rate ?? 0)
          };
        });
        this.departmentStatsById = byId;
      },
      error: () => {
        this.departmentStatsById = {};
      }
    });
  }

  get filteredDepartments(): Department[] {
    const raw = this.searchTerm.trim();
    if (!raw) return this.departments;
    const term = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.departments.filter((d) => {
      const name = (d.departmentName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const head = (d.departmentHead || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const id = String(d.departmentId ?? '');
      return name.includes(term) || head.includes(term) || id.includes(term);
    });
  }

  get activeDepartmentsCount(): number {
    return this.departments.filter((department) => this.departmentEmployeeCount(department) > 0).length;
  }

  get topDepartment(): DepartmentKpiSpotlight | null {
    return this.departmentSpotlight('top');
  }

  get priorityDepartment(): DepartmentKpiSpotlight | null {
    return this.departmentSpotlight('priority');
  }

  getDepartmentStats(department: Department): DepartmentStats {
    return (
      this.departmentStatsById[department.departmentId] ?? {
        departmentId: department.departmentId,
        departmentName: department.departmentName,
        employeeCount: department.employeeCount ?? 0,
        evaluatedEmployees: 0,
        averagePerformanceScore: 0,
        averageAttendanceRate: 0
      }
    );
  }

  departmentPerformanceScore(department: Department): number {
    const score = this.getDepartmentStats(department).averagePerformanceScore ?? 0;
    return Number(score.toFixed(2));
  }

  departmentPerformancePercent(department: Department): number {
    const score = this.departmentPerformanceScore(department);
    const percent = score;
    return Math.max(0, Math.min(100, Number(percent.toFixed(1))));
  }

  performanceBarStyle(department: Department): Record<string, string> {
    const score = this.departmentPerformanceScore(department);
    const { start, end } = this.performanceGradient(score);
    return {
      background: `linear-gradient(90deg, ${start} 0%, ${end} 100%)`
    };
  }

  departmentPresenceRate(department: Department): number {
    const rate = this.getDepartmentStats(department).averageAttendanceRate ?? 0;
    return Number(rate.toFixed(1));
  }

  formatPresenceRate(department: Department): string {
    const count = this.departmentEmployeeCount(department);
    if (count === 0) return '—';
    const rate = this.departmentPresenceRate(department);
    return rate > 0 ? `${rate}%` : '—';
  }

  formatPerformanceScore(department: Department): string {
    const count = this.departmentEmployeeCount(department);
    if (count === 0) return '—';
    const score = this.departmentPerformanceScore(department);
    return score > 0 ? String(score) : '—';
  }

  isDepartmentEmpty(department: Department): boolean {
    return this.departmentEmployeeCount(department) === 0;
  }

  departmentEvaluatedEmployees(department: Department): number {
    return this.getDepartmentStats(department).evaluatedEmployees ?? 0;
  }

  departmentEmployeeCount(department: Department): number {
    return this.getDepartmentStats(department).employeeCount ?? 0;
  }

  openDepartmentPanel(department: Department) {
    this.selectedDepartment = department;
    this.isDepartmentPanelOpen = true;
    this.activeDepartmentTab = 'members';
    this.membersSearchTerm = '';
    this.noteSavedMessage = '';
    this.noteDraft = '';
    this.noteEditingId = null;
    this.notePendingDeleteId = null;
    this.departmentEmployeesLoading = true;
    this.departmentEmployeesError = '';
    this.departmentEmployees = [];

    this.departmentService.getDepartmentEmployees(department.departmentId).subscribe({
      next: (employees) => {
        this.departmentEmployees = employees ?? [];
        this.departmentEmployeesLoading = false;
      },
      error: () => {
        this.departmentEmployees = [];
        this.departmentEmployeesError = 'Impossible de charger les collaborateurs du département.';
        this.departmentEmployeesLoading = false;
      }
    });
  }

  closeDepartmentPanel() {
    this.isDepartmentPanelOpen = false;
    this.selectedDepartment = null;
    this.departmentEmployees = [];
    this.departmentEmployeesError = '';
    this.departmentEmployeesLoading = false;
    this.membersSearchTerm = '';
    this.noteDraft = '';
    this.noteEditingId = null;
    this.notePendingDeleteId = null;
    this.noteSavedMessage = '';
  }

  openCreateDepartmentModal() {
    this.departmentFormMode = 'create';
    this.departmentBeingEdited = null;
    this.departmentForm = { departmentName: '', departmentHead: '', description: '', active: true };
    this.departmentFormError = '';
    this.showDepartmentFormModal = true;
  }

  openEditDepartmentModal(department: Department, event: MouseEvent) {
    event.stopPropagation();
    this.departmentFormMode = 'edit';
    this.departmentBeingEdited = department;
    this.departmentForm = {
      departmentName: department.departmentName ?? '',
      departmentHead: department.departmentHead ?? '',
      description: department.description ?? '',
      active: department.active ?? true
    };
    this.departmentFormError = '';
    this.showDepartmentFormModal = true;
  }

  get isDepartmentFormValid(): boolean {
    return !!this.departmentForm.departmentName.trim();
  }

  closeDepartmentFormModal() {
    if (this.isSavingDepartment) return;
    this.showDepartmentFormModal = false;
    this.departmentBeingEdited = null;
    this.departmentFormError = '';
  }

  saveDepartmentForm() {
    const departmentName = this.departmentForm.departmentName.trim();
    if (!departmentName) {
      this.departmentFormError = 'Le nom du département est obligatoire.';
      return;
    }

    this.isSavingDepartment = true;
    this.departmentFormError = '';

    const request$ = this.departmentFormMode === 'create'
      ? this.departmentService.createDepartment(this.buildCreatePayload(departmentName))
      : this.departmentService.updateDepartment(
          this.departmentBeingEdited!.departmentId,
          this.buildUpdatePayload(departmentName)
        );

    request$.pipe(
      finalize(() => {
        this.isSavingDepartment = false;
      })
    ).subscribe({
      next: (saved) => {
        this.actionSuccessMessage = this.departmentFormMode === 'create'
          ? `Département "${saved.departmentName}" créé avec succès.`
          : `Département "${saved.departmentName}" modifié avec succès.`;
        this.actionErrorMessage = '';
        this.showDepartmentFormModal = false;
        this.departmentBeingEdited = null;
        this.loadDepartments();
        this.dismissActionMessageLater();
      },
      error: (error) => {
        this.departmentFormError = this.extractErrorMessage(error, 'Enregistrement impossible.');
      }
    });
  }

  private buildCreatePayload(departmentName: string): DepartmentCreatePayload {
    return {
      departmentName,
      departmentHead: this.departmentForm.departmentHead.trim() || null,
      description: this.departmentForm.description.trim() || null,
      active: this.departmentForm.active
    };
  }

  private buildUpdatePayload(departmentName: string): DepartmentUpdatePayload {
    return {
      departmentName,
      departmentHead: this.departmentForm.departmentHead.trim() || null,
      description: this.departmentForm.description.trim() || null,
      active: this.departmentForm.active
    };
  }

  onDeleteDepartment(department: Department, event: MouseEvent) {
    event.stopPropagation();
    this.actionErrorMessage = '';
    this.actionSuccessMessage = '';
    this.departmentToDelete = department;
    this.showDeleteDepartmentModal = true;
  }

  closeDeleteDepartmentModal() {
    if (this.isDeletingDepartment) return;
    this.showDeleteDepartmentModal = false;
    this.departmentToDelete = null;
  }

  confirmDeleteDepartment() {
    if (!this.departmentToDelete) return;
    const department = this.departmentToDelete;
    this.isDeletingDepartment = true;

    this.departmentService.deleteDepartment(department.departmentId).pipe(
      finalize(() => {
        this.isDeletingDepartment = false;
      })
    ).subscribe({
      next: () => {
        this.actionSuccessMessage = `Département "${department.departmentName}" supprimé avec succès.`;
        this.actionErrorMessage = '';
        this.showDeleteDepartmentModal = false;
        this.departmentToDelete = null;
        if (this.selectedDepartment?.departmentId === department.departmentId) {
          this.closeDepartmentPanel();
        }
        this.loadDepartments();
        this.dismissActionMessageLater();
      },
      error: (error) => {
        this.actionErrorMessage = this.extractErrorMessage(error, 'Suppression impossible.');
        this.actionSuccessMessage = '';
        this.showDeleteDepartmentModal = false;
        this.departmentToDelete = null;
      }
    });
  }

  private extractErrorMessage(error: any, fallback: string): string {
    const raw = error?.error;
    return (typeof raw === 'string' ? raw : null) ?? raw?.message ?? error?.message ?? fallback;
  }

  private dismissActionMessageLater() {
    window.setTimeout(() => {
      this.actionSuccessMessage = '';
    }, 3500);
  }

  employeeInitials(employee: DepartmentEmployee): string {
    return `${(employee.firstName?.[0] ?? '').toUpperCase()}${(employee.lastName?.[0] ?? '').toUpperCase()}` || '--';
  }

  employeeFullName(employee: DepartmentEmployee): string {
    return `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() || 'Collaborateur';
  }

  get filteredDepartmentEmployees(): DepartmentEmployee[] {
    const raw = this.membersSearchTerm.trim();
    if (!raw) return this.departmentEmployees;

    const term = this.normalizeText(raw);
    return this.departmentEmployees.filter((employee) => {
      const fullName = this.normalizeText(this.employeeFullName(employee));
      const role = this.normalizeText(employee.jobTitle ?? '');
      return fullName.includes(term) || role.includes(term) || String(employee.employeeId ?? '').includes(term);
    });
  }

  saveDepartmentNote() {
    if (!this.selectedDepartment) return;
    const deptId = this.selectedDepartment.departmentId;
    const content = this.noteDraft.trim();
    if (!content) return;

    const existing = this.departmentNotes[deptId] ?? [];
    if (this.noteEditingId != null) {
      this.departmentNotes[deptId] = existing.map((note) =>
        note.id === this.noteEditingId ? { ...note, content } : note
      );
    } else {
      const newNote: DepartmentNote = {
        id: Date.now(),
        content,
        createdAt: new Date().toISOString()
      };
      this.departmentNotes[deptId] = [...existing, newNote];
    }

    localStorage.setItem('department-notes', JSON.stringify(this.departmentNotes));
    this.noteSavedMessage = this.noteEditingId != null ? 'Note modifiée.' : 'Note enregistrée.';
    this.noteDraft = '';
    this.noteEditingId = null;
    this.notePendingDeleteId = null;
    window.setTimeout(() => {
      this.noteSavedMessage = '';
    }, 1600);
  }

  startEditNote(note: DepartmentNote) {
    this.noteDraft = note.content;
    this.noteEditingId = note.id;
    this.notePendingDeleteId = null;
  }

  requestDeleteNote(noteId: number) {
    this.notePendingDeleteId = noteId;
  }

  confirmDeleteNote(noteId: number) {
    if (!this.selectedDepartment) return;
    const deptId = this.selectedDepartment.departmentId;
    const existing = this.departmentNotes[deptId] ?? [];
    this.departmentNotes[deptId] = existing.filter((note) => note.id !== noteId);
    localStorage.setItem('department-notes', JSON.stringify(this.departmentNotes));
    this.notePendingDeleteId = null;

    if (this.noteEditingId === noteId) {
      this.noteEditingId = null;
      this.noteDraft = '';
    }
  }

  cancelDeleteNote() {
    this.notePendingDeleteId = null;
  }

  cancelEditNote() {
    this.noteEditingId = null;
    this.noteDraft = '';
  }

  get selectedDepartmentNotes(): DepartmentNote[] {
    if (!this.selectedDepartment) return [];
    return this.departmentNotes[this.selectedDepartment.departmentId] ?? [];
  }

  noteDisplayDate(isoDate: string): string {
    return new Date(isoDate).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private loadSavedNotes() {
    try {
      const raw = localStorage.getItem('department-notes');
      const parsed = raw ? JSON.parse(raw) : {};
      this.departmentNotes = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.departmentNotes = {};
    }
  }

  private normalizeText(value: string): string {
    return (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private departmentSpotlight(type: 'top' | 'priority'): DepartmentKpiSpotlight | null {
    const activeDepartments = this.departments
      .filter((department) => this.departmentEmployeeCount(department) > 0)
      .map((department) => ({
        departmentName: department.departmentName,
        score: this.departmentPerformanceScore(department)
      }));

    if (activeDepartments.length === 0) return null;

    const sorted = [...activeDepartments].sort((left, right) => left.score - right.score);
    if (type === 'priority') {
      // Afficher uniquement si le département le plus faible est vraiment sous le seuil critique
      return sorted[0].score < 65 ? sorted[0] : null;
    }
    return sorted[sorted.length - 1];
  }

  private performanceGradient(score: number): { start: string; end: string } {
    if (score >= 70) {
      if (score >= 90) {
        return { start: '#22c55e', end: '#15803d' };
      }
      return { start: '#4ade80', end: '#16a34a' };
    }

    if (score >= 50) {
      return { start: '#d9f99d', end: '#84cc16' };
    }

    if (score >= 35) {
      return { start: '#fb923c', end: '#f97316' };
    }

    return { start: '#f87171', end: '#dc2626' };
  }

  departmentIconKey(departmentName: string): string {
    const normalized = (departmentName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (/(ingenierie|engineering|developpement|dev|informatique|it|tech)/.test(normalized)) {
      return 'engineering';
    }
    if (/(ressources humaines|rh|human resources)/.test(normalized)) {
      return 'hr';
    }
    if (/(finance|comptabilite|comptable|budget)/.test(normalized)) {
      return 'finance';
    }
    if (/(marketing|communication|brand)/.test(normalized)) {
      return 'marketing';
    }
    if (/(vente|sales|commercial|business development)/.test(normalized)) {
      return 'sales';
    }
    if (/(operation|logistique|production)/.test(normalized)) {
      return 'operations';
    }
    if (/(juridique|legal|compliance)/.test(normalized)) {
      return 'legal';
    }
    return 'default';
  }

  onNotifications() {}

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  onDeconnexion() {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil() { this.router.navigate(['/profil']); }
}