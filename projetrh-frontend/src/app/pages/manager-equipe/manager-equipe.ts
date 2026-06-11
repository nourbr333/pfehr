import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { AuthService, Utilisateur } from '../../services/auth';
import { ManagerService, ManagerTeamMember } from '../../services/manager.service';
import { EmployeeService } from '../../services/employee.service';
import { NotificationService, CreateNotificationPayload } from '../../services/notification.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { ToastService } from '../../components/toast/toast.service';

interface TeamMemberUI extends ManagerTeamMember {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  poste: string;
  departmentId: number | null;
  departmentLabel: string;
  departement: string;
}


interface DepartmentFilterOption {
  id: number;
  label: string;
}

@Component({
  selector: 'app-manager-equipe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './manager-equipe.html',
  styleUrl: './manager-equipe.scss'
})
export class ManagerEquipeComponent implements OnInit {
  utilisateur: Utilisateur | null;

  searchTerm = '';
  selectedDepartmentId: number | null = null;
  members: TeamMemberUI[] = [];
  filteredMembers: TeamMemberUI[] = [];

  currentPage = 1;
  readonly pageSize = 10;

  // Modals
  isDeleteModalOpen = false;
  memberToDelete: TeamMemberUI | null = null;
  isDeletingMember = false;
  deleteError = '';

  // Invite modal
  isInviteModalOpen = false;
  inviteSearchQuery = '';
  allEmployees: TeamMemberUI[] = [];
  inviteFilteredList: TeamMemberUI[] = [];
  isInviting = false;
  inviteSuccessMessage = '';
  inviteError = '';

  // Drawer
  isDrawerOpen = false;
  selectedMember: TeamMemberUI | null = null;
  isLoading = false;

  constructor(
    private router: Router,
    private auth: AuthService,
    private managerService: ManagerService,
    private employeeService: EmployeeService,
    private notificationService: NotificationService,
    private toastService: ToastService
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit(): void {
    this.loadTeam();
    this.loadAllEmployees();
  }

  // Sidebar
  get dashboardRoute(): string { return this.utilisateur?.route ?? '/login'; }

  // Header
  get membersCountLabel(): string {
    const n = this.filteredMembers.length;
    return `${n} membre${n > 1 ? 's' : ''}`;
  }

  onNotifications() {}
  onDeconnexion() { this.auth.deconnexion(); this.router.navigate(['/login']); }
  onProfil() { this.router.navigate(['/profil']); }

  onSearch() {
    this.currentPage = 1;
    this.applyFilter();
  }

  onDepartmentFilterChange(departmentId?: number | null) {
    this.selectedDepartmentId = typeof departmentId === 'number' ? departmentId : null;
    this.currentPage = 1;
    this.applyFilter();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredMembers.length / this.pageSize));
  }

  get paginatedMembers(): TeamMemberUI[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredMembers.slice(start, start + this.pageSize);
  }

  get canGoPrevious(): boolean {
    return this.currentPage > 1;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages;
  }

  private setPage(page: number) {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages);
  }

  previousPage() {
    this.setPage(this.currentPage - 1);
  }

  nextPage() {
    this.setPage(this.currentPage + 1);
  }

  get departmentOptions(): DepartmentFilterOption[] {
    const byId = new Map<number, string>();
    this.members.forEach((member) => {
      if (member.departmentId == null) return;
      if (!byId.has(member.departmentId)) {
        byId.set(member.departmentId, member.departmentLabel);
      }
    });

    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  get selectedDepartmentLabel(): string {
    if (this.selectedDepartmentId == null) return 'Tous';
    return this.departmentOptions.find((option) => option.id === this.selectedDepartmentId)?.label ?? 'Tous';
  }

  get selectedDepartmentCount(): number {
    return this.filteredMembers.length;
  }

  private loadTeam() {
    const managerEmployeeId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (managerEmployeeId == null) {
      this.members = [];
      this.applyFilter();
      return;
    }

    this.isLoading = true;
    this.managerService.loadTeamForManager(managerEmployeeId).subscribe({
      next: (team) => {
        this.members = team.map(m => this.toUI(m));
        this.applyFilter();
        this.isLoading = false;
      },
      error: () => {
        this.members = [];
        this.applyFilter();
        this.isLoading = false;
      }
    });
  }

  applyFilter() {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredMembers = this.members.filter(m => {
      if (this.selectedDepartmentId != null && m.departmentId !== this.selectedDepartmentId) {
        return false;
      }

      if (!term) {
        return true;
      }

      const full = `${m.firstName} ${m.lastName}`.toLowerCase();
      return full.includes(term);
    });

    this.currentPage = Math.min(Math.max(1, this.currentPage), this.totalPages);
  }

  memberDepartment(member: TeamMemberUI): string {
    return member.departmentLabel;
  }

  // --- Table helpers ---

  initialsOf(m: TeamMemberUI): string {
    const a = (m.firstName?.[0] ?? '').toUpperCase();
    const b = (m.lastName?.[0] ?? '').toUpperCase();
    return `${a}${b}` || '??';
  }

  perfBadgeClass(score: number): string {
    if (score >= 80) return 'badge green';
    if (score >= 60) return 'badge orange';
    return 'badge red';
  }

  presenceBarClass(rate: number): string {
    if (rate > 80) return 'bar green';
    if (rate >= 65) return 'bar orange';
    return 'bar red';
  }

  // --- CRUD ---

  openRetireModal(member: TeamMemberUI) {
    this.memberToDelete = member;
    this.deleteError = '';
    this.isDeleteModalOpen = true;
  }

  openDeleteModal(member: TeamMemberUI) {
    this.openRetireModal(member);
  }

  closeDeleteModal() {
    if (this.isDeletingMember) return;
    this.isDeleteModalOpen = false;
    this.memberToDelete = null;
    this.deleteError = '';
  }

  confirmDelete() {
    if (!this.memberToDelete) return;
    const member = this.memberToDelete;
    const employeeId = Number(member.id);
    this.isDeletingMember = true;
    this.deleteError = '';
    let succeeded = false;
    this.employeeService.updateEmployee(employeeId, { managerId: null }).pipe(
      timeout(15000),
      finalize(() => {
        this.isDeletingMember = false;
        if (succeeded) {
          this.isDeleteModalOpen = false;
          this.memberToDelete = null;
          this.deleteError = '';
          this.toastService.success('Collaborateur retiré de l\'équipe.');
        }
      })
    ).subscribe({
      next: () => {
        succeeded = true;
        this.members = this.members.filter(m => m.id !== member.id);
        this.managerService.deleteMember(member.id);
        if (this.selectedMember?.id === member.id) this.closeDrawer();
        this.applyFilter();
      },
      error: () => {
        this.deleteError = 'Impossible de retirer ce membre. Réessayez.';
        this.toastService.error('Impossible de retirer ce membre. Réessayez.');
      }
    });
  }

  // --- Drawer / fiche ---

  openDrawer(member: TeamMemberUI) {
    this.selectedMember = member;
    this.isDrawerOpen = true;
  }

  closeDrawer() {
    this.isDrawerOpen = false;
    this.selectedMember = null;
  }

  // --- KPI cards ---

  get totalMembersCount(): number {
    return this.filteredMembers.length;
  }

  get distinctDeptCount(): number {
    return new Set(this.filteredMembers.map(m => m.departmentId).filter(id => id != null)).size;
  }

  get distinctPostCount(): number {
    return new Set(this.filteredMembers.map(m => m.poste).filter(j => !!j && j !== '—')).size;
  }

  get recentArrivalsCount(): number {
    return this.members.filter((member) => this.isWithinLastDays(member.hire_date, 30)).length;
  }

  get recentArrivalsSubvalue(): string {
    const count = this.recentArrivalsCount;
    return count > 1 ? 'nouveaux collaborateurs' : 'nouveau collaborateur';
  }


  // --- Mapping / Validation ---

  private toUI(m: ManagerTeamMember): TeamMemberUI {
    const { firstName, lastName } = this.splitName(m.name);
    const sanitizedId = String(m.id).trim() || 'employe';
    const fromApi = (m.email ?? '').trim();
    const normalizedDepartment = this.normalizeDepartment(m.department);
    const departmentId = this.normalizeDepartmentId(m.department_id);
    return {
      ...m,
      firstName,
      lastName,
      email: fromApi || `${sanitizedId.toLowerCase()}@rh.com`,
      telephone: '',
      poste: m.job_title ?? 'Collaborateur',
      departmentId,
      departmentLabel: normalizedDepartment,
      departement: normalizedDepartment,
      department: normalizedDepartment
    };
  }

  private fromUI(m: TeamMemberUI): ManagerTeamMember {
    const jobTitle = m.poste.trim();
    const department = this.normalizeDepartment(m.departement);

    return {
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      email: m.email?.trim() || undefined,
      job_title: jobTitle && jobTitle !== '—' ? jobTitle : undefined,
      department: department && department !== '—' ? department : undefined,
      department_id: m.departmentId ?? undefined,
      performance_score: Number(m.performance_score) || 0,
      attendance_rate: Number(m.attendance_rate) || 0,
      absences_days: Number(m.absences_days) || 0,
      late_rate: Number(m.late_rate) || 0,
      late_days: Number(m.late_days) || 0,
      overtime_hours: Number(m.overtime_hours) || 0
    };
  }

  private normalizeDepartment(value: string | undefined | null): string {
    const normalized = (value ?? '').trim();
    return normalized || '—';
  }

  private normalizeDepartmentId(value: number | undefined | null): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
  }

  private isWithinLastDays(dateStr: string | undefined, days: number): boolean {
    if (!dateStr) return false;
    const hired = new Date(dateStr);
    if (Number.isNaN(hired.getTime())) return false;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    hired.setHours(0, 0, 0, 0);
    return hired >= cutoff;
  }

  private splitName(full: string): { firstName: string; lastName: string } {
    const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  private emptyForm(): TeamMemberUI {
    return {
      id: '',
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      telephone: '',
      poste: '',
      departmentId: null,
      departmentLabel: '—',
      departement: '',
      performance_score: 70,
      attendance_rate: 90,
      absences_days: 0,
      late_rate: 0,
      late_days: 0,
      overtime_hours: 0
    };
  }

  private validateMember(m: TeamMemberUI): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!m.firstName.trim()) errs['firstName'] = 'Prénom requis';
    if (!m.lastName.trim()) errs['lastName'] = 'Nom requis';
    if (!m.email.trim()) errs['email'] = 'Email requis';
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) errs['email'] = 'Email invalide';
    if (!m.poste.trim()) errs['poste'] = 'Poste requis';
    if (m.performance_score < 0 || m.performance_score > 100) errs['performance_score'] = '0-100';
    if (m.attendance_rate < 0 || m.attendance_rate > 100) errs['attendance_rate'] = '0-100';
    return errs;
  }



  // --- Invite modal ---

  private loadAllEmployees() {
    this.employeeService.getAllEmployees().subscribe({
      next: (employees) => {
        this.allEmployees = employees.map(e => ({
          id: String(e.employeeId),
          name: `${e.firstName} ${e.lastName}`,
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email ?? '',
          telephone: '',
          poste: e.jobTitle,
          departmentId: e.departmentId,
          departmentLabel: e.departmentName ?? '—',
          departement: e.departmentName ?? '—',
          department: e.departmentName ?? '—',
          performance_score: 0,
          attendance_rate: 0,
          absences_days: 0,
          late_rate: 0,
          late_days: 0,
          overtime_hours: 0
        } as TeamMemberUI));
      },
      error: () => { this.allEmployees = []; }
    });
  }

  openInviteModal() {
    this.inviteSearchQuery = '';
    this.inviteFilteredList = [];
    this.inviteSuccessMessage = '';
    this.inviteError = '';
    this.isInviteModalOpen = true;
    this.filterInviteList();
  }

  closeInviteModal() {
    if (this.isInviting) return;
    this.isInviteModalOpen = false;
  }

  onInviteSearch() {
    this.filterInviteList();
  }

  private filterInviteList() {
    const currentIds = new Set(this.members.map(m => m.id));
    const term = this.inviteSearchQuery.trim().toLowerCase();
    this.inviteFilteredList = this.allEmployees.filter(e => {
      if (currentIds.has(e.id)) return false;
      if (!term) return true;
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return fullName.includes(term) || e.id.includes(term);
    }).slice(0, 10);
  }

  inviteEmployee(employee: TeamMemberUI) {
    const managerEmployeeId = this.managerService.resolveManagerEmployeeId(this.utilisateur);
    if (managerEmployeeId == null) return;
    const managerName = `${this.utilisateur?.prenom ?? ''} ${this.utilisateur?.nom ?? ''}`.trim();
    const empName = `${employee.firstName} ${employee.lastName}`.trim();

    this.isInviting = true;
    this.inviteError = '';
    this.inviteSuccessMessage = '';

    const payload: CreateNotificationPayload = {
      type: 'invitation_equipe',
      title: 'Invitation équipe',
      message: `Manager ${managerName} souhaite inviter ${empName} à son équipe.`,
      recipientId: null,
      targetRole: 'RESPONSABLE_RH',
      sourceTable: 'employees',
      sourceId: Number(employee.id),
      targetUrl: `/employes?employeeId=${employee.id}&manager=${managerEmployeeId}`
    };

    this.notificationService.createNotification(payload).pipe(
      timeout(10000),
      finalize(() => { this.isInviting = false; })
    ).subscribe({
      next: () => {
        this.inviteSuccessMessage = `Demande envoyée pour ${empName}.`;
        this.inviteSearchQuery = '';
        this.filterInviteList();
        this.notificationService.refresh();
      },
      error: () => {
        this.inviteError = 'Envoi impossible. Réessayez.';
      }
    });
  }

}


