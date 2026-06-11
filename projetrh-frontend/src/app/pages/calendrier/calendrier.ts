import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AuthService, Utilisateur } from '../../services/auth';
import { CalendarEventTargetType, CalendarEventType, CalendarService, UpsertCalendarEventPayload } from '../../services/calendar.service';
import { Department, DepartmentService } from '../../services/department.service';
import { Employee, EmployeeService } from '../../services/employee.service';
import { Subject, debounceTime, distinctUntilChanged, forkJoin, of, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { LeaveRequestService } from '../../rh/absences-conges/services/leave-request.service';
import { LeaveRequest } from '../../rh/absences-conges/absences-conges.models';

interface Jour {
  date: Date;
  moisCourant: boolean;
  aujd: boolean;
  evenements: Evenement[];
}

interface Evenement {
  id?: number;
  titre: string;
  type: 'conge' | 'reunion' | 'formation' | 'autre' | 'rappel' | 'tache';
  leaveType?: string;
  heure?: string;
  plannedBy?: string;
  description?: string;
  createdByEmployeeId?: number | null;
  cibleType?: CalendarEventTargetType;
  cibleDepartmentId?: number | null;
  cibleJobTitle?: string | null;
  cibleEmployeeIds?: number[];
  isLeave?: boolean;
}

@Component({
  selector: 'app-calendrier',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './calendrier.html',
  styleUrl: './calendrier.scss'
})
export class CalendrierComponent implements OnInit, OnDestroy {
  utilisateur: Utilisateur | null;
  showAddModal = false;
  prefilledDate = '';
  submitted = false;
  editingEventId: number | null = null;
  addForm: FormGroup;
  isSaving = false;
  isLoadingEvents = false;
  eventLoadError = '';
  submitErrorMessage = '';

  moisActuel: Date = new Date();
  jours: Jour[] = [];
  jourSelectionne: Jour | null = null;
  hoveredJour: Jour | null = null;
  tooltipX = 0;
  tooltipY = 0;
  private selectedKey: string | null = null;
  private eventsByDate: Record<string, Evenement[]> = {};
  private destroy$ = new Subject<void>();
  private employeeSearch$ = new Subject<string>();

  employees: Employee[] = [];
  selectableEmployees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  selectedEmployees: Employee[] = [];
  employeeSearchTerm = '';

  departments: Department[] = [];
  jobTitles: string[] = [];

  readonly JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  readonly MOIS = [
    'Janvier','Février','Mars','Avril','Mai','Juin',
    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private auth: AuthService,
    private calendarService: CalendarService,
    private employeeService: EmployeeService,
    private departmentService: DepartmentService,
    private leaveRequestService: LeaveRequestService
  ) {
    this.addForm = this.fb.group({
      titre: ['', Validators.required],
      description: [''],
      date: ['', Validators.required],
      heure: [''],
      type: ['autre'],
      visibilityMode: ['manager_team'],
      targetDepartmentId: [null],
      targetJobTitle: [''],
      targetEmployeeIds: [[]]
    });

    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit() {
    this.setupEmployeeAutocomplete();
    this.setupDynamicTargeting();
    this.applyDefaultVisibilityMode();
    this.loadDepartments();
    this.loadEmployees();
    this.genererMois();
    this.loadVisibleEventsForCurrentMonth();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get titreMois(): string {
    return `${this.MOIS[this.moisActuel.getMonth()]} ${this.moisActuel.getFullYear()}`;
  }

  moisPrecedent() {
    this.moisActuel = new Date(this.moisActuel.getFullYear(), this.moisActuel.getMonth() - 1, 1);
    this.loadVisibleEventsForCurrentMonth();
  }

  moisSuivant() {
    this.moisActuel = new Date(this.moisActuel.getFullYear(), this.moisActuel.getMonth() + 1, 1);
    this.loadVisibleEventsForCurrentMonth();
  }

  aujourdhui() {
    this.moisActuel = new Date();
    this.loadVisibleEventsForCurrentMonth();
  }

  get isManager(): boolean { return (this.utilisateur?.role ?? '').toLowerCase().includes('manager'); }

  get isAdmin(): boolean { return (this.utilisateur?.role ?? '') === 'ADMIN'; }

  get isRespRH(): boolean {
    const role = (this.utilisateur?.role ?? '').toLowerCase();
    return role.includes('administrateur') || role.includes('rh') || role.includes('responsable');
  }

  get canAddEvent(): boolean { return this.isManager || this.isRespRH || this.isAdmin; }

  get dashboardRoute(): string { return this.utilisateur?.route ?? '/login'; }

  get adminDashboardRoute(): string { return '/admin/dashboard'; }

  get monEquipeRoute(): string { return '/manager/equipe'; }

  get displayRole(): string {
    const raw = this.utilisateur?.role ?? '';
    if (raw === 'ADMIN') return 'Admin';
    if (raw.toLowerCase().includes('manager')) return 'Manager';
    if (raw.toLowerCase().includes('responsable')) return 'Responsable RH';
    if (raw.toLowerCase().includes('administrateur')) return 'Responsable RH';
    return raw;
  }

  get avatarText(): string {
    const cleaned = (this.utilisateur?.initiales ?? '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2);
    }
    const a = (this.utilisateur?.prenom?.trim().charAt(0) ?? '').toUpperCase();
    const b = (this.utilisateur?.nom?.trim().charAt(0) ?? '').toUpperCase();
    const fallback = `${a}${b}`.replace(/[^A-Z]/g, '');
    return fallback || 'NA';
  }

  selectionner(jour: Jour) {
    this.jourSelectionne = jour;
    this.selectedKey = this.formatDate(jour.date);
  }

  hasLeave(evenements: Evenement[]): boolean {
    return evenements.some(e => e.isLeave);
  }

  hasNonLeaveEvent(evenements: Evenement[]): boolean {
    return evenements.some(e => !e.isLeave);
  }

  onCellMouseEnter(jour: Jour, event: MouseEvent) {
    if (jour.evenements.length > 0) {
      this.hoveredJour = jour;
      this.updateTooltipPos(event);
    }
  }

  onCellMouseLeave() {
    this.hoveredJour = null;
  }

  onCellMouseMove(event: MouseEvent) {
    if (this.hoveredJour) {
      this.updateTooltipPos(event);
    }
  }

  private updateTooltipPos(event: MouseEvent) {
    this.tooltipX = event.clientX + 14;
    this.tooltipY = event.clientY + 14;
  }

  genererMois() {
    const annee = this.moisActuel.getFullYear();
    const mois  = this.moisActuel.getMonth();
    const aujd  = new Date();

    const premierJour = new Date(annee, mois, 1);
    // Lundi = 0, Dimanche = 6
    let jourSemaine = premierJour.getDay(); // 0=dim
    jourSemaine = jourSemaine === 0 ? 6 : jourSemaine - 1;

    const jours: Jour[] = [];

    // Jours du mois précédent
    for (let i = jourSemaine - 1; i >= 0; i--) {
      const d = new Date(annee, mois, -i);
      jours.push({ date: d, moisCourant: false, aujd: false, evenements: this.getEvenements(d) });
    }

    // Jours du mois courant
    const dernierJour = new Date(annee, mois + 1, 0).getDate();
    for (let d = 1; d <= dernierJour; d++) {
      const date = new Date(annee, mois, d);
      jours.push({
        date,
        moisCourant: true,
        aujd: date.toDateString() === aujd.toDateString(),
        evenements: this.getEvenements(date)
      });
    }

    // Compléter jusqu'à 42 cases
    let next = 1;
    while (jours.length < 42) {
      const d = new Date(annee, mois + 1, next++);
      jours.push({ date: d, moisCourant: false, aujd: false, evenements: this.getEvenements(d) });
    }

    this.jours = jours;
    if (this.selectedKey) {
      const found = this.jours.find(j => this.formatDate(j.date) === this.selectedKey);
      this.jourSelectionne = found ?? null;
      if (!found) this.selectedKey = null;
    } else {
      this.jourSelectionne = null;
    }
  }

  private getEvenements(date: Date): Evenement[] {
    const key = this.formatDate(date);
    return this.eventsByDate[key] ?? [];
  }

  private formatDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  openAddModal(date?: string) {
    this.prefilledDate = date ?? '';
    this.editingEventId = null;
    this.selectedEmployees = [];
    this.employeeSearchTerm = '';
    this.filteredEmployees = [];
    this.submitErrorMessage = '';
    this.applyDefaultVisibilityMode();
    this.addForm.patchValue({
      titre: '',
      description: '',
      date: this.prefilledDate,
      heure: '',
      type: 'autre',
      targetDepartmentId: null,
      targetJobTitle: '',
      targetEmployeeIds: []
    });
    this.refreshSelectableEmployees();
    this.showAddModal = true;
  }

  openEditModal(ev: Evenement) {
    if (!ev.id || !this.jourSelectionne || this.isSaving || !this.canManageEvent(ev)) return;
    this.editingEventId = ev.id;
    this.prefilledDate = this.formatDate(this.jourSelectionne.date);
    this.selectedEmployees = this.resolveEmployeesByIds(ev.cibleEmployeeIds ?? []);
    this.refreshSelectableEmployees();
    this.addForm.patchValue({
      titre: ev.titre ?? '',
      description: ev.description ?? '',
      date: this.prefilledDate,
      heure: ev.heure ?? '',
      type: ev.type ?? 'autre',
      visibilityMode: ev.cibleType ?? this.defaultVisibilityMode(),
      targetDepartmentId: ev.cibleDepartmentId ?? null,
      targetJobTitle: ev.cibleJobTitle ?? '',
      targetEmployeeIds: this.selectedEmployees.map(e => e.employeeId)
    });
    this.updateJobTitles();
    this.submitted = false;
    this.submitErrorMessage = '';
    this.employeeSearchTerm = '';
    this.filteredEmployees = [];
    this.showAddModal = true;
  }

  closeAddModal() {
    this.addForm.reset({
      titre: '',
      description: '',
      date: '',
      heure: '',
      type: 'autre',
      visibilityMode: this.defaultVisibilityMode(),
      targetDepartmentId: null,
      targetJobTitle: '',
      targetEmployeeIds: []
    });
    this.editingEventId = null;
    this.selectedEmployees = [];
    this.employeeSearchTerm = '';
    this.filteredEmployees = [];
    this.submitted = false;
    this.submitErrorMessage = '';
    this.showAddModal = false;
  }

  submitAddEvent() {
    if (this.isSaving) return;
    this.submitted = true;
    this.submitErrorMessage = '';
    this.syncSelectedEmployeeIds();
    if (this.addForm.invalid) return;

    const {
      titre,
      description,
      date,
      heure,
      type,
      visibilityMode,
      targetDepartmentId,
      targetJobTitle
    } = this.addForm.value;
    const payload: UpsertCalendarEventPayload = {
      title: String(titre).trim(),
      description: description ? String(description).trim() : '',
      eventDate: date,
      eventTime: heure ? String(heure).trim() : null,
      eventType: type as CalendarEventType,
      targetType: visibilityMode as CalendarEventTargetType,
      targetDepartmentId: targetDepartmentId ? Number(targetDepartmentId) : null,
      targetJobTitle: targetJobTitle ? String(targetJobTitle).trim() : null,
      targetEmployeeIds: this.selectedEmployees.map(e => e.employeeId),
      createdByEmployeeId: this.utilisateur?.employeeId ?? null,
      createdByName: `${this.utilisateur?.prenom ?? ''} ${this.utilisateur?.nom ?? ''}`.trim() || this.utilisateur?.email || 'Utilisateur',
      createdByRole: this.utilisateur?.role ?? null
    };

    this.isSaving = true;
    if (this.editingEventId) {
      this.calendarService.updateEvent(this.editingEventId, payload).subscribe({
        next: () => {
          this.loadVisibleEventsForCurrentMonth();
          this.closeAddModal();
          this.isSaving = false;
        },
        error: (error) => {
          this.submitErrorMessage = this.resolveHttpErrorMessage(error, 'Impossible de modifier l’événement.');
          this.isSaving = false;
        }
      });
    } else {
      this.calendarService.addEvent(payload).subscribe({
        next: () => {
          this.loadVisibleEventsForCurrentMonth();
          this.closeAddModal();
          this.isSaving = false;
        },
        error: (error) => {
          this.submitErrorMessage = this.resolveHttpErrorMessage(error, 'Impossible de créer l’événement.');
          this.isSaving = false;
        }
      });
    }
  }

  supprimerEvenement(ev: Evenement) {
    if (!this.canAddEvent || !ev.id || this.isSaving || !this.canManageEvent(ev)) return;
    this.isSaving = true;
    this.calendarService.deleteEvent(ev.id).subscribe({
      next: () => {
        this.loadVisibleEventsForCurrentMonth();
        this.isSaving = false;
      },
      error: (error) => {
        this.submitErrorMessage = this.resolveHttpErrorMessage(error, 'Impossible de supprimer l’événement.');
        this.isSaving = false;
      }
    });
  }

  onDeconnexion() { this.auth.deconnexion(); this.router.navigate(['/login']); }
  onProfil()      { this.router.navigate(['/profil']); }
  onNotifications() {}

  eventTypeLabel(type: Evenement['type']): string {
    if (type === 'reunion') return 'Réunion';
    if (type === 'rappel') return 'Rappel';
    if (type === 'formation') return 'Formation';
    if (type === 'tache') return 'Événement';
    if (type === 'conge') return 'Congé';
    return 'Autre';
  }

  leaveEventTypeLabel(ev: Evenement): string {
    if (ev.isLeave && ev.leaveType) {
      return this.leaveTypeLabels[ev.leaveType] ?? 'Congé';
    }
    return this.eventTypeLabel(ev.type);
  }

  get isSpecificTargetMode(): boolean {
    const mode = String(this.addForm.get('visibilityMode')?.value ?? '');
    return mode === 'manager_specific' || mode === 'rh_specific';
  }

  get isRhDepartmentMode(): boolean {
    return String(this.addForm.get('visibilityMode')?.value ?? '') === 'rh_department';
  }

  get isRhJobTitleMode(): boolean {
    return String(this.addForm.get('visibilityMode')?.value ?? '') === 'rh_job_title';
  }

  get displayTargetLabel(): string {
    return this.isManager ? 'Afficher pour' : 'Cible de l’événement';
  }

  onSearchSpecificEmployees() {
    this.employeeSearch$.next(this.employeeSearchTerm);
  }

  addSpecificEmployee(employee: Employee) {
    if (this.selectedEmployees.some(item => item.employeeId === employee.employeeId)) {
      return;
    }
    this.selectedEmployees = [...this.selectedEmployees, employee];
    this.employeeSearchTerm = '';
    this.filteredEmployees = [];
    this.syncSelectedEmployeeIds();
  }

  removeSpecificEmployee(employeeId: number) {
    this.selectedEmployees = this.selectedEmployees.filter(item => item.employeeId !== employeeId);
    this.syncSelectedEmployeeIds();
    this.onSearchSpecificEmployees();
  }

  displayEmployeeName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  canManageEvent(event: Evenement): boolean {
    if (!this.canAddEvent) return false;
    if (this.isRespRH || this.isAdmin) return true;
    const currentEmployeeId = this.utilisateur?.employeeId;
    if (!currentEmployeeId) return false;
    return event.createdByEmployeeId === currentEmployeeId;
  }

  private readonly leaveTypeLabels: Record<string, string> = {
    'conge-paye': 'Congé payé',
    'maladie': 'Maladie',
    'sans-solde': 'Sans solde',
    'evenement-familial': 'Événement familial',
    'autre': 'Autre absence'
  };

  private loadVisibleEventsForCurrentMonth() {
    const from = this.formatDate(new Date(this.moisActuel.getFullYear(), this.moisActuel.getMonth(), 1));
    const to = this.formatDate(new Date(this.moisActuel.getFullYear(), this.moisActuel.getMonth() + 1, 0));
    this.isLoadingEvents = true;
    this.eventLoadError = '';

    const events$ = this.calendarService
      .getVisibleEvents({ from, to })
      .pipe(catchError(() => of([] as any[])));

    const leaves$ = this.leaveRequestService
      .getAll({ status: 'approved' })
      .pipe(catchError(() => of([] as LeaveRequest[])));

    forkJoin([events$, leaves$])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([events, leaves]) => {
          this.eventsByDate = {};

          // Map calendar events
          for (const event of events) {
            const mapped: Evenement = {
              id: event.eventId,
              titre: event.title,
              type: (event.eventType as Evenement['type']) ?? 'autre',
              heure: this.normalizeTime(event.eventTime),
              plannedBy: event.createdByName ?? '',
              createdByEmployeeId: event.createdByEmployeeId ?? null,
              description: event.description ?? '',
              cibleType: event.targetType,
              cibleDepartmentId: event.targetDepartmentId ?? null,
              cibleJobTitle: event.targetJobTitle ?? null,
              cibleEmployeeIds: event.targetEmployeeIds ?? []
            };
            if (!this.eventsByDate[event.eventDate]) {
              this.eventsByDate[event.eventDate] = [];
            }
            this.eventsByDate[event.eventDate].push(mapped);
          }

          // Map approved leaves — expand each leave across its date range
          for (const leave of leaves) {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const cursor = new Date(start);
            while (cursor <= end) {
              const dow = cursor.getDay();
              if (dow !== 0 && dow !== 6) { // skip weekends
                const key = this.formatDate(cursor);
                const mapped: Evenement = {
                  titre: `${leave.employeeName ?? 'Employé'} — ${this.leaveTypeLabels[leave.type] ?? leave.type}`,
                  type: 'conge',
                  leaveType: leave.type,
                  isLeave: true,
                  plannedBy: leave.employeeName ?? '',
                  description: `${leave.requestedDays}j · ${leave.startDate} → ${leave.endDate}${leave.notes ? '\n' + leave.notes : ''}`
                };
                if (!this.eventsByDate[key]) {
                  this.eventsByDate[key] = [];
                }
                this.eventsByDate[key].push(mapped);
              }
              cursor.setDate(cursor.getDate() + 1);
            }
          }

          this.genererMois();
          this.isLoadingEvents = false;
        },
        error: (error) => {
          this.eventsByDate = {};
          this.genererMois();
          this.eventLoadError = this.resolveHttpErrorMessage(error, 'Impossible de charger les événements.');
          this.isLoadingEvents = false;
        }
      });
  }

  private resolveHttpErrorMessage(error: unknown, defaultMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return 'API calendrier introuvable. Redémarrez le backend pour charger la route /api/events.';
      }
      if (error.status === 400) {
        return 'Données invalides. Vérifiez les champs obligatoires de ciblage.';
      }
      if (error.status === 0) {
        return 'Backend indisponible. Vérifiez que le serveur Spring est démarré.';
      }
    }
    return defaultMessage;
  }

  private normalizeTime(time: string | null | undefined): string {
    if (!time) return '';
    return time.slice(0, 5);
  }

  private setupDynamicTargeting() {
    this.addForm.get('visibilityMode')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.selectedEmployees = [];
      this.employeeSearchTerm = '';
      this.filteredEmployees = [];
      this.addForm.patchValue(
        {
          targetEmployeeIds: [],
          targetDepartmentId: null,
          targetJobTitle: ''
        },
        { emitEvent: false }
      );
      this.updateTargetValidators();
      this.refreshSelectableEmployees();
      this.updateJobTitles();
    });

    this.addForm.get('targetDepartmentId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateJobTitles();
      if (this.isRhJobTitleMode) {
        const selectedJobTitle = String(this.addForm.get('targetJobTitle')?.value ?? '');
        if (selectedJobTitle && !this.jobTitles.includes(selectedJobTitle)) {
          this.addForm.get('targetJobTitle')?.setValue('');
        }
      }
    });
  }

  private setupEmployeeAutocomplete() {
    this.employeeSearch$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((term) => {
        const search = term.trim().toLowerCase();
        const selectedIds = new Set(this.selectedEmployees.map(item => item.employeeId));
        const pool = this.selectableEmployees.filter(item => !selectedIds.has(item.employeeId));

        if (!search) {
          this.filteredEmployees = pool.slice(0, 8);
          return;
        }

        this.filteredEmployees = pool
          .filter((employee) => {
            const name = `${employee.firstName} ${employee.lastName}`.toLowerCase();
            const dept = (employee.departmentName ?? '').toLowerCase();
            const job = (employee.jobTitle ?? '').toLowerCase();
            return name.includes(search) || dept.includes(search) || job.includes(search);
          })
          .slice(0, 8);
      });
  }

  private loadEmployees() {
    this.employeeService
      .getAllEmployees()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (employees) => {
          this.employees = employees;
          this.refreshSelectableEmployees();
          this.updateJobTitles();
        },
        error: () => {
          this.employees = [];
          this.selectableEmployees = [];
          this.filteredEmployees = [];
        }
      });
  }

  private loadDepartments() {
    this.departmentService
      .getAllDepartments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (departments) => {
          this.departments = departments;
        },
        error: () => {
          this.departments = [];
        }
      });
  }

  private refreshSelectableEmployees() {
    const currentEmployeeId = this.utilisateur?.employeeId;
    if (this.isManager && currentEmployeeId) {
      this.selectableEmployees = this.employees.filter(item => item.managerId === currentEmployeeId);
    } else {
      this.selectableEmployees = [...this.employees];
    }
    this.onSearchSpecificEmployees();
  }

  private updateJobTitles() {
    const departmentId = Number(this.addForm.get('targetDepartmentId')?.value);
    if (!departmentId) {
      this.jobTitles = [];
      return;
    }
    const unique = new Set(
      this.employees
        .filter(item => item.departmentId === departmentId)
        .map(item => (item.jobTitle ?? '').trim())
        .filter(Boolean)
    );
    this.jobTitles = Array.from(unique).sort((a, b) => a.localeCompare(b));
  }

  private applyDefaultVisibilityMode() {
    this.addForm.get('visibilityMode')?.setValue(this.defaultVisibilityMode(), { emitEvent: false });
    this.updateTargetValidators();
  }

  private defaultVisibilityMode(): CalendarEventTargetType {
    return this.isManager ? 'manager_team' : 'rh_company';
  }

  private syncSelectedEmployeeIds() {
    this.addForm.get('targetEmployeeIds')?.setValue(this.selectedEmployees.map(item => item.employeeId), {
      emitEvent: false
    });
  }

  private resolveEmployeesByIds(employeeIds: number[]): Employee[] {
    const idSet = new Set(employeeIds);
    return this.employees.filter(employee => idSet.has(employee.employeeId));
  }

  private updateTargetValidators() {
    const mode = String(this.addForm.get('visibilityMode')?.value ?? '');
    const departmentControl = this.addForm.get('targetDepartmentId');
    const jobTitleControl = this.addForm.get('targetJobTitle');
    const employeesControl = this.addForm.get('targetEmployeeIds');
    if (!departmentControl || !jobTitleControl || !employeesControl) return;

    departmentControl.clearValidators();
    jobTitleControl.clearValidators();
    employeesControl.clearValidators();

    if (mode === 'rh_department') {
      departmentControl.setValidators([Validators.required]);
    } else if (mode === 'rh_job_title') {
      departmentControl.setValidators([Validators.required]);
      jobTitleControl.setValidators([Validators.required]);
    } else if (mode === 'manager_specific' || mode === 'rh_specific') {
      employeesControl.setValidators([this.arrayMinLength(1)]);
    }

    departmentControl.updateValueAndValidity({ emitEvent: false });
    jobTitleControl.updateValueAndValidity({ emitEvent: false });
    employeesControl.updateValueAndValidity({ emitEvent: false });
  }

  private arrayMinLength(minLength: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!Array.isArray(value)) return { arrayMinLength: true };
      return value.length >= minLength ? null : { arrayMinLength: true };
    };
  }
}