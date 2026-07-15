
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, Utilisateur } from '../../services/auth';
import { Department, DepartmentService } from '../../services/department.service';
import { Employee, EmployeeService, EmployeeUpdatePayload } from '../../services/employee.service';
import { Attendance, AttendanceService } from '../../services/attendance.service';
import { Subject } from 'rxjs';
import { ToastComponent } from '../../components/toast/toast.component';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';
import { NotificationService, CreateNotificationPayload } from '../../services/notification.service';
import { filter, finalize, retry, takeUntil } from 'rxjs/operators';


type ImportStep = 'select' | 'review';

interface EditableImportRow {
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  departmentId: string;
  departmentName: string;
  jobTitle: string;
  hireDate: string;
  managerId: string;
}

interface EmployeeEditForm {
  firstName: string;
  lastName: string;
  jobTitle: string;
  departmentId: string;
  managerId: string;
  isManager: boolean;
}

@Component({
  selector: 'app-employes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, ToastComponent, NotificationsPanelComponent],
  templateUrl: './employes.html',
  styleUrl: './employes.scss'
})
export class EmployesComponent implements OnInit, OnDestroy {
  utilisateur: Utilisateur | null;
  employees: Employee[] = [];
  /** Full list loaded once for KPI cards (unpaged). */
  private statsEmployees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  departments: Department[] = [];

  searchTerm = '';
  selectedDepartmentId = '';
  showImportModal = false;
  importStep: ImportStep = 'select';
  selectedImportFile: File | null = null;
  importFileError = '';
  importInProgress = false;
  importAnalysisStatus = '';
  importModalMessage = '';
  importRows: EditableImportRow[] = [];
  importRowsPage = 1;
  readonly importRowsPageSize = 8;
  importSuccessMessage = '';
  actionErrorMessage = '';
  actionSuccessMessage = '';

  currentPage = 1;
  readonly pageSize = 20;
  totalElements = 0;
  serverTotalPages = 1;
  employeesLoading = false;
  isSavingEmployeeEdit = false;
  showEditEmployeeModal = false;
  editEmployeeError = '';
  employeeBeingEdited: Employee | null = null;
  isDeletingEmployee = false;
  showDeleteEmployeeModal = false;
  employeeToDelete: Employee | null = null;
  employeeEditForm: EmployeeEditForm = {
    firstName: '',
    lastName: '',
    jobTitle: '',
    departmentId: '',
    managerId: '',
    isManager: false
  };

  isEmployeePanelOpen = false;
  selectedEmployee: Employee | null = null;
  attendanceByEmployeeId: Record<number, Attendance[]> = {};
  performanceScoreByEmployeeId: Record<number, number> = {};

  // Assign manager modal
  managers: Employee[] = [];
  isAssignManagerModalOpen = false;
  assignManagerTarget: Employee | null = null;
  selectedManagerId: number | null = null;
  focusManagerId: number | null = null;
  isSavingAssignment = false;
  assignManagerError = '';
  private readonly destroy$ = new Subject<void>();
  private xlsxModule: typeof import('xlsx') | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private employeeService: EmployeeService,
    private departmentService: DepartmentService,
    private attendanceService: AttendanceService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  ngOnInit() {
    this.loadEmployees();
    this.loadDepartments();
    this.loadAttendanceForTable();
    this.loadManagers();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects === '/employes') {
          this.loadEmployees();
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onNotifications() {}

  onAddEmployee() {
    this.openImportModal();
  }

  onEditEmployee(employee: Employee, event: MouseEvent) {
    event.stopPropagation();
    this.actionErrorMessage = '';
    this.actionSuccessMessage = '';
    this.employeeBeingEdited = employee;
    this.employeeEditForm = {
      firstName: employee.firstName ?? '',
      lastName: employee.lastName ?? '',
      jobTitle: employee.jobTitle ?? '',
      departmentId: String(employee.departmentId ?? ''),
      managerId: employee.managerId == null ? '' : String(employee.managerId),
      isManager: employee.isManager ?? false
    };
    this.editEmployeeError = '';
    this.showEditEmployeeModal = true;
  }

  closeEditEmployeeModal() {
    if (this.isSavingEmployeeEdit) return;
    this.showEditEmployeeModal = false;
    this.editEmployeeError = '';
    this.employeeBeingEdited = null;
  }

  saveEmployeeEdit() {
    if (!this.employeeBeingEdited) {
      return;
    }
    const firstName = this.employeeEditForm.firstName.trim();
    const lastName = this.employeeEditForm.lastName.trim();
    const jobTitle = this.employeeEditForm.jobTitle.trim();
    const departmentIdValue = this.employeeEditForm.departmentId.trim();
    const managerIdValue = this.employeeEditForm.managerId.trim();
    if (!firstName || !lastName || !jobTitle || !departmentIdValue) {
      this.editEmployeeError = 'Les champs prénom, nom, poste et département sont obligatoires.';
      return;
    }
    if (!/^\d+$/.test(departmentIdValue)) {
      this.editEmployeeError = 'Le département doit être un identifiant numérique.';
      return;
    }
    if (managerIdValue !== '' && !/^\d+$/.test(managerIdValue)) {
      this.editEmployeeError = 'Le manager doit être vide ou un identifiant numérique.';
      return;
    }
    const managerId = managerIdValue === '' ? null : Number(managerIdValue);
    if (managerId != null && managerId === this.employeeBeingEdited.employeeId) {
      this.editEmployeeError = 'Un collaborateur ne peut pas être son propre manager.';
      return;
    }

    this.isSavingEmployeeEdit = true;
    this.editEmployeeError = '';
    const payload: EmployeeUpdatePayload = {
      firstName,
      lastName,
      jobTitle,
      departmentId: Number(departmentIdValue),
      managerId,
      isManager: this.employeeEditForm.isManager
    };
    this.employeeService.updateEmployee(this.employeeBeingEdited.employeeId, payload).pipe(
      finalize(() => {
        this.isSavingEmployeeEdit = false;
      })
    ).subscribe({
      next: (updated) => {
        this.loadEmployees();
        if (this.selectedEmployee?.employeeId === updated.employeeId) {
          this.selectedEmployee = updated;
        }
        this.actionSuccessMessage = `collaborateur ${updated.firstName} ${updated.lastName} modifié avec succès.`;
        this.actionErrorMessage = '';
        this.showEditEmployeeModal = false;
        this.employeeBeingEdited = null;
      },
      error: (error) => {
        const raw = error?.error;
        this.editEmployeeError = (typeof raw === 'string' ? raw : null) ?? raw?.message ?? error?.message ?? 'Modification impossible.';
      }
    });
  }

  onDeleteEmployee(employee: Employee, event: MouseEvent) {
    event.stopPropagation();
    this.actionErrorMessage = '';
    this.actionSuccessMessage = '';
    this.employeeToDelete = employee;
    this.showDeleteEmployeeModal = true;
  }

  closeDeleteEmployeeModal() {
    if (this.isDeletingEmployee) return;
    this.showDeleteEmployeeModal = false;
    this.employeeToDelete = null;
  }

  confirmDeleteEmployee() {
    if (!this.employeeToDelete) return;
    this.isDeletingEmployee = true;
    const employee = this.employeeToDelete;
    this.employeeService.deleteEmployee(employee.employeeId).pipe(
      finalize(() => {
        this.isDeletingEmployee = false;
      })
    ).subscribe({
      next: () => {
        this.loadEmployees();
        this.loadAttendanceForTable();
        if (this.selectedEmployee?.employeeId === employee.employeeId) {
          this.closeEmployeePanel();
        }
        this.actionSuccessMessage = `collaborateur ${employee.firstName} ${employee.lastName} supprimé avec succès.`;
        this.showDeleteEmployeeModal = false;
        this.employeeToDelete = null;
      },
      error: (error) => {
        const raw = error?.error;
        this.actionErrorMessage = (typeof raw === 'string' ? raw : null) ?? raw?.message ?? error?.message ?? 'Suppression impossible.';
        this.showDeleteEmployeeModal = false;
        this.employeeToDelete = null;
      }
    });
  }

  async downloadEmployeeTemplate(): Promise<void> {
    const XLSX = await this.loadXlsxWithTimeout();

    // Columns match EmployeeImportRowPayload — employeeId is intentionally absent (auto-generated by the DB).
    const headers = [
      'firstName', 'lastName', 'email', 'gender',
      'dateOfBirth', 'maritalStatus', 'departmentId', 'jobTitle', 'hireDate', 'managerId'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);

    // Lock column widths for readability
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'collaborateurs');
    XLSX.writeFile(wb, 'template_employes.xlsx');
  }

  openImportModal() {
    this.showImportModal = true;
    this.importStep = 'select';
    this.selectedImportFile = null;
    this.importFileError = '';
    this.importModalMessage = '';
    this.importRows = [];
    this.importRowsPage = 1;
  }

  closeImportModal() {
    if (this.importInProgress) return;
    this.showImportModal = false;
    this.importStep = 'select';
    this.selectedImportFile = null;
    this.importFileError = '';
    this.importModalMessage = '';
    this.importRows = [];
    this.importRowsPage = 1;
  }

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedImportFile = file;
    this.importFileError = '';
    if (!file) {
      return;
    }
    const normalizedName = file.name.toLowerCase();
    const isSupported = normalizedName.endsWith('.xlsx') || normalizedName.endsWith('.csv');
    if (!isSupported) {
      this.importFileError = 'Seuls les fichiers .xlsx ou .csv sont acceptés.';
      this.selectedImportFile = null;
      input.value = '';
      return;
    }
    this.importModalMessage = '';
  }

  async analyzeImportFile() {
    if (!this.selectedImportFile) {
      this.importFileError = 'Veuillez sélectionner un fichier .xlsx ou .csv.';
      return;
    }
    this.importFileError = '';
    this.importModalMessage = '';
    this.importInProgress = true;
    this.importAnalysisStatus = 'Initialisation...';
    let forceUnlocked = false;
    const unlockTimer = window.setTimeout(() => {
      forceUnlocked = true;
      this.importInProgress = false;
      this.importAnalysisStatus = '';
      this.importFileError = "L'analyse a dépassé le délai. Réessayez.";
      this.cdr.detectChanges();
    }, 15000);

    try {
      const fileName = this.selectedImportFile.name.toLowerCase();
      let parsedRows: Record<string, unknown>[] = [];

      if (fileName.endsWith('.csv')) {
        this.importAnalysisStatus = 'Lecture du fichier CSV...';
        const csvText = await this.readFileWithTimeout(this.selectedImportFile, 'text') as string;
        if (forceUnlocked) return;

        this.importAnalysisStatus = 'Analyse des lignes CSV...';
        parsedRows = this.parseCsvToObjects(csvText);
      } else {
        this.importAnalysisStatus = 'Chargement du module Excel...';
        const XLSX = await this.loadXlsxWithTimeout();
        if (forceUnlocked) return;

        this.importAnalysisStatus = 'Lecture du fichier Excel...';
        const sourceData = new Uint8Array(await this.readFileWithTimeout(this.selectedImportFile, 'arrayBuffer') as ArrayBuffer);
        if (forceUnlocked) return;

        this.importAnalysisStatus = 'Analyse des lignes Excel...';
        const workbook = XLSX.read(sourceData, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          throw new Error('Le fichier ne contient aucune feuille.');
        }

        const sheet = workbook.Sheets[firstSheetName];
        parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      }
      if (!parsedRows.length) {
        throw new Error('Le fichier ne contient aucune ligne de données.');
      }

      const rows = parsedRows.map((raw, index) => this.toEditableImportRow(raw, index + 2));
      this.importRows = rows;
      this.importRowsPage = 1;
      this.importStep = 'review';
      this.importAnalysisStatus = '';
    } catch (error: any) {
      this.importFileError = error?.message ?? 'Fichier invalide.';
      this.importAnalysisStatus = '';
    } finally {
      window.clearTimeout(unlockTimer);
      this.importInProgress = false;
      this.cdr.detectChanges();
    }
  }

  private async readFileWithTimeout(file: File, mode: 'arrayBuffer' | 'text'): Promise<ArrayBuffer | string> {
    const readPromise = mode === 'text' ? file.text() : file.arrayBuffer();
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Lecture du fichier expirée. Veuillez réessayer.')), 12000);
    });
    return Promise.race([readPromise, timeoutPromise]);
  }

  private parseCsvToObjects(csvText: string): Record<string, unknown>[] {
    const normalizedText = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalizedText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (!lines.length) {
      return [];
    }

    const headers = lines[0].split(',').map((header) => header.trim());
    if (!headers.length) {
      return [];
    }

    return lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim());
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? '';
      });
      return row;
    });
  }

  private async loadXlsxWithTimeout(): Promise<typeof import('xlsx')> {
    if (this.xlsxModule) {
      return this.xlsxModule;
    }
    const importPromise = import('xlsx/xlsx.mjs');
    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Chargement du module Excel expiré. Rechargez la page puis réessayez.')), 10000);
    });
    const module = await Promise.race([importPromise, timeoutPromise]);
    this.xlsxModule = module;
    return module;
  }

  submitEmployeeImport() {
    if (!this.selectedImportFile) {
      this.importFileError = 'Veuillez sélectionner un fichier .xlsx ou .csv.';
      return;
    }

    this.importInProgress = true;
    this.importFileError = '';
    this.importModalMessage = '';

    const safetyTimer = window.setTimeout(() => {
      if (this.importInProgress) {
        this.importInProgress = false;
        this.importFileError = "L'import a dépassé le délai maximum. Vérifiez le fichier puis réessayez.";
        this.cdr.detectChanges();
      }
    }, 65000);

    this.employeeService.importExcel(this.selectedImportFile).pipe(
      finalize(() => {
        window.clearTimeout(safetyTimer);
        this.importInProgress = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (result) => {
        this.selectedImportFile = null;
        this.importModalMessage = `Import validé: ${result.createdEmployees} collaborateur(s) ajouté(s).`;
        this.importSuccessMessage = `${result.createdEmployees} collaborateur(s) ajouté(s), ${result.importedRows} ligne(s) importée(s).`;
        this.showImportModal = false;
        this.loadEmployees();
        this.loadAttendanceForTable();
        this.cdr.detectChanges();
      },
      error: (error) => {
        const raw = error?.error;
        const message = error?.name === 'TimeoutError'
          ? "L'import prend trop de temps. Vérifiez le fichier puis réessayez."
          : (typeof raw === 'string' ? raw : null)
            ?? raw?.message
            ?? error?.message
            ?? 'Import Excel impossible.';
        this.importFileError = message;
        this.cdr.detectChanges();
      }
    });
  }

  get importRowsTotalPages(): number {
    return Math.max(1, Math.ceil(this.importRows.length / this.importRowsPageSize));
  }

  get paginatedImportRows(): EditableImportRow[] {
    const start = (this.importRowsPage - 1) * this.importRowsPageSize;
    return this.importRows.slice(start, start + this.importRowsPageSize);
  }

  previousImportRowsPage() {
    this.importRowsPage = Math.max(1, this.importRowsPage - 1);
  }

  nextImportRowsPage() {
    this.importRowsPage = Math.min(this.importRowsTotalPages, this.importRowsPage + 1);
  }

  deleteImportRow(pageIndex: number) {
    const absoluteIndex = (this.importRowsPage - 1) * this.importRowsPageSize + pageIndex;
    if (absoluteIndex < 0 || absoluteIndex >= this.importRows.length) return;
    this.importRows.splice(absoluteIndex, 1);
    if (this.importRowsPage > this.importRowsTotalPages) {
      this.importRowsPage = this.importRowsTotalPages;
    }
  }

  loadEmployees() {
    this.loadEmployeeStats();
    this.loadEmployeesPage();
  }

  private loadEmployeeStats() {
    this.employeeService.getEmployeesPage({ unpaged: true }).pipe(
      retry({ count: 1, delay: 350 })
    ).subscribe({
      next: (page) => {
        this.statsEmployees = page.content ?? [];
      },
      error: () => {
        this.statsEmployees = [];
      }
    });
  }

  private loadEmployeesPage() {
    this.employeesLoading = true;
    const departmentId = this.selectedDepartmentId ? Number(this.selectedDepartmentId) : null;
    this.employeeService.getEmployeesPage({
      page: this.currentPage - 1,
      size: this.pageSize,
      search: this.searchTerm,
      departmentId: Number.isFinite(departmentId) ? departmentId : null
    }).pipe(
      retry({ count: 1, delay: 350 }),
      finalize(() => { this.employeesLoading = false; })
    ).subscribe({
      next: (page) => {
        this.employees = page.content ?? [];
        this.filteredEmployees = this.employees;
        this.totalElements = page.totalElements ?? 0;
        this.serverTotalPages = Math.max(1, page.totalPages ?? 1);
        this.currentPage = (page.page ?? 0) + 1;
        this.loadPerformanceScoresForTable();

        const idParam = this.route.snapshot.queryParamMap.get('employeeId');
        const managerParam = this.route.snapshot.queryParamMap.get('manager');
        if (managerParam) {
          this.focusManagerId = Number(managerParam);
        }
        if (idParam) {
          const target = this.employees.find((e) => e.employeeId === Number(idParam));
          if (target) {
            this.openEmployeePanel(target);
          } else {
            this.employeeService.getEmployeeById(Number(idParam)).subscribe({
              next: (employee) => this.openEmployeePanel(employee),
              error: () => undefined
            });
          }
        }
      },
      error: () => {
        this.employees = [];
        this.filteredEmployees = [];
        this.totalElements = 0;
        this.serverTotalPages = 1;
        this.currentPage = 1;
        this.performanceScoreByEmployeeId = {};
      }
    });
  }

  loadManagers() {
    this.employeeService.getManagers().subscribe({
      next: (data) => { this.managers = data; },
      error: () => { this.managers = []; }
    });
  }

  loadDepartments() {
    this.departmentService.getAllDepartments().subscribe({
      next: (data) => (this.departments = data),
      error: () => (this.departments = [])
    });
  }

  onSearch() {
    this.currentPage = 1;
    this.loadEmployeesPage();
  }

  onDepartmentFilterChange() {
    this.currentPage = 1;
    this.loadEmployeesPage();
  }

  applyFilters() {
    this.onSearch();
  }

  get totalPages(): number {
    return this.serverTotalPages;
  }

  get paginatedEmployees(): Employee[] {
    return [...this.employees].sort((a, b) => {
      const aManager = a.isManager === true;
      const bManager = b.isManager === true;
      if (aManager !== bManager) return aManager ? -1 : 1;
      const nameA = `${a.lastName} ${a.firstName}`.toLocaleLowerCase('fr-FR');
      const nameB = `${b.lastName} ${b.firstName}`.toLocaleLowerCase('fr-FR');
      return nameA.localeCompare(nameB, 'fr-FR');
    });
  }

  get canGoPrevious(): boolean {
    return this.currentPage > 1;
  }

  get canGoNext(): boolean {
    return this.currentPage < this.totalPages;
  }

  private setPage(page: number) {
    this.currentPage = Math.min(Math.max(1, page), this.totalPages);
    this.loadEmployeesPage();
  }

  previousPage() {
    this.setPage(this.currentPage - 1);
  }

  nextPage() {
    this.setPage(this.currentPage + 1);
  }

  openEmployeePanel(employee: Employee) {
    this.selectedEmployee = employee;
    this.isEmployeePanelOpen = true;
  }

  closeEmployeePanel() {
    this.isEmployeePanelOpen = false;
    this.selectedEmployee = null;
  }

  private loadAttendanceForTable() {
    this.attendanceService.getAll().subscribe({
      next: (rows) => {
        const map: Record<number, Attendance[]> = {};
        for (const row of rows) {
          if (row.employeeId != null) {
            if (!map[row.employeeId]) map[row.employeeId] = [];
            map[row.employeeId].push(row);
          }
        }
        this.attendanceByEmployeeId = map;
      },
      error: () => {
        this.attendanceByEmployeeId = {};
      }
    });
  }

  initialsOf(employee: Employee): string {
    const first = (employee.firstName?.[0] ?? '').toUpperCase();
    const last = (employee.lastName?.[0] ?? '').toUpperCase();
    return `${first}${last}` || '--';
  }

  // ── Employee KPI getters ─────────────────────────────────────────────────

  get kpiTotalEmployees(): number {
    return this.totalElements || this.statsEmployees.length;
  }

  get kpiManagerCount(): number {
    const source = this.statsEmployees.length ? this.statsEmployees : this.employees;
    return source.filter(e => e.isManager === true).length;
  }

  // Collaborateurs non-managers sans manager assigné.
  get kpiNoManagerCount(): number {
    const source = this.statsEmployees.length ? this.statsEmployees : this.employees;
    return source.filter(e => !e.isManager && e.managerId == null).length;
  }

  get kpiNewThisMonth(): number {
    const source = this.statsEmployees.length ? this.statsEmployees : this.employees;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return source.filter(e => {
      if (!e.hireDate) return false;
      const d = new Date(e.hireDate);
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }

  private loadPerformanceScoresForTable() {
    const employeeIds = this.employees
      .map((employee) => employee.employeeId)
      .filter((id) => Number.isFinite(id));
    this.employeeService.getPerformanceScores(employeeIds).subscribe({
      next: (scores) => {
        this.performanceScoreByEmployeeId = scores ?? {};
      },
      error: () => {
        this.performanceScoreByEmployeeId = {};
      }
    });
  }

  // Score composite (présence 40% · évaluation 40% · ponctualité 20%, mois courant).
  performanceScore(employee: Employee): number | null {
    const score = this.performanceScoreByEmployeeId[employee.employeeId];
    return score == null ? null : score;
  }

  performanceScoreLabel(employee: Employee): string | null {
    const score = this.performanceScore(employee);
    if (score == null) return null;
    return Number.isInteger(score) ? String(score) : score.toFixed(1);
  }

  // Returns only attendance rows for the current calendar month (table presence column).
  private currentMonthRows(employeeId: number): import('../../services/attendance.service').Attendance[] {
    const rows = this.attendanceByEmployeeId[employeeId];
    if (!rows || rows.length === 0) return [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based
    return rows.filter(r => {
      if (!r.attendanceDate) return false;
      const d = new Date(r.attendanceDate);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }

  presenceRate(employee: Employee): number {
    const rows = this.currentMonthRows(employee.employeeId);
    if (rows.length === 0) return 0;
    const presentCount = rows.filter(r => r.isPresent).length;
    return Math.round((presentCount / rows.length) * 100);
  }

  tablePresenceRate(employee: Employee): number {
    return this.presenceRate(employee);
  }

  emailOf(employee: Employee): string {
    return `${employee.firstName}.${employee.lastName}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9.]/g, '')
      .toLowerCase() + '@rh.com';
  }

  isManager(employee: Employee): boolean {
    return employee.isManager === true;
  }

  managerLabel(employee: Employee): string {
    if (!employee.managerId) return 'Non assigné';
    const pool = this.statsEmployees.length ? this.statsEmployees : this.employees;
    const m = pool.find(e => e.employeeId === employee.managerId);
    return m ? `${m.firstName} ${m.lastName}` : `Manager (ID ${employee.managerId})`;
  }

  managerInitials(employee: Employee): string {
    if (!employee.managerId) return '';
    const pool = this.statsEmployees.length ? this.statsEmployees : this.employees;
    const m = pool.find(e => e.employeeId === employee.managerId);
    if (!m) return '??';
    return ((m.firstName?.[0] ?? '') + (m.lastName?.[0] ?? '')).toUpperCase() || '--';
  }

  openAssignManagerModal(employee: Employee) {
    this.assignManagerTarget = employee;
    this.selectedManagerId = this.focusManagerId ?? employee.managerId ?? null;
    this.assignManagerError = '';
    this.isAssignManagerModalOpen = true;
  }

  closeAssignManagerModal() {
    if (this.isSavingAssignment) return;
    this.isAssignManagerModalOpen = false;
    this.assignManagerTarget = null;
    this.assignManagerError = '';
  }

  confirmAssignManager() {
    if (!this.assignManagerTarget) return;
    if (this.selectedManagerId == null) {
      this.assignManagerError = 'Veuillez sélectionner un manager.';
      return;
    }
    const targetEmployee = this.assignManagerTarget;
    const managerId = this.selectedManagerId;
    this.isSavingAssignment = true;
    this.assignManagerError = '';
    this.employeeService.updateEmployee(targetEmployee.employeeId, { managerId }).pipe(
      finalize(() => { this.isSavingAssignment = false; })
    ).subscribe({
      next: (updated) => {
        this.loadEmployees();
        if (this.selectedEmployee?.employeeId === updated.employeeId) {
          this.selectedEmployee = updated;
        }
        this.focusManagerId = null;
        this.isAssignManagerModalOpen = false;
        this.assignManagerTarget = null;
        // Notify the manager that the employee has joined their team
        this.employeeService.getUserIdByEmployee(managerId).subscribe({
          next: (managerUserId) => {
            if (managerUserId == null) return;
            const empName = `${updated.firstName} ${updated.lastName}`.trim();
            const payload: CreateNotificationPayload = {
              type: 'employe_equipe',
              title: 'Nouveau membre dans votre équipe',
              message: `${empName} a rejoint votre équipe.`,
              recipientId: managerUserId,
              targetRole: undefined,
              sourceTable: 'employees',
              sourceId: updated.employeeId,
              targetUrl: '/manager/equipe'
            };
            this.notificationService.createNotification(payload).subscribe();
          }
        });
      },
      error: (err) => {
        const raw = err?.error;
        this.assignManagerError = (typeof raw === 'string' ? raw : null) ?? raw?.message ?? 'Affectation impossible.';
      }
    });
  }

  perfBadgeClass(score: number): string {
    if (score >= 85) return 'perf-badge green';
    if (score >= 70) return 'perf-badge orange';
    return 'perf-badge red';
  }

  presenceFillClass(rate: number): string {
    if (rate >= 75) return 'presence-fill green';
    if (rate >= 50) return 'presence-fill orange';
    return 'presence-fill red';
  }

  private seededMetric(_seed: number, _min: number, _max: number, _salt: number): number {
    return 0;
  }

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  onDeconnexion() {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil() { this.router.navigate(['/profil']); }

  private toEditableImportRow(raw: Record<string, unknown>, excelLineNumber: number): EditableImportRow {
    const getValue = (aliases: string[]): string => {
      for (const alias of aliases) {
        const found = Object.keys(raw).find((key) => this.normalizeHeader(key) === this.normalizeHeader(alias));
        if (found) {
          return String(raw[found] ?? '').trim();
        }
      }
      return '';
    };

    const row: EditableImportRow = {
      firstName: getValue(['first_name', 'firstName', 'prenom', 'prénom']),
      lastName: getValue(['last_name', 'lastName', 'nom']),
      email: getValue(['email']),
      gender: getValue(['gender', 'sexe']),
      dateOfBirth: getValue(['date_of_birth', 'dateOfBirth', 'date_naissance']),
      maritalStatus: getValue(['marital_status', 'maritalStatus', 'statut_marital']),
      departmentId: getValue(['department_id', 'departmentId']),
      departmentName: getValue(['department_name', 'departmentName', 'departement', 'département']),
      jobTitle: getValue(['job_title', 'jobTitle', 'poste']),
      hireDate: getValue(['hire_date', 'hireDate', 'date_embauche']),
      managerId: getValue(['manager_id', 'managerId'])
    };

    const requiredKeys: Array<keyof EditableImportRow> = [
      'firstName',
      'lastName',
      'email',
      'gender',
      'dateOfBirth',
      'maritalStatus',
      'departmentId',
      'jobTitle',
      'hireDate'
    ];
    const missing = requiredKeys.filter((field) => !row[field] || !row[field].trim());
    if (missing.length > 0) {
      throw new Error(`Ligne ${excelLineNumber}: colonnes manquantes (${missing.join(', ')}).`);
    }
    return row;
  }

  private validateImportRows(): string {
    const emailKeys = new Set<string>();
    for (let i = 0; i < this.importRows.length; i += 1) {
      const row = this.importRows[i];
      const line = i + 1;
      const requiredFields: Array<keyof EditableImportRow> = [
        'firstName',
        'lastName',
        'email',
        'gender',
        'dateOfBirth',
        'maritalStatus',
        'departmentId',
        'jobTitle',
        'hireDate'
      ];
      for (const field of requiredFields) {
        if (!row[field] || !row[field].trim()) {
          return `Ligne ${line}: champ ${field} obligatoire.`;
        }
      }
      if (!/^\d+$/.test(row.departmentId.trim())) {
        return `Ligne ${line}: department_id doit être un entier.`;
      }
      const mgr = row.managerId.trim();
      if (mgr !== '' && (!/^\d+$/.test(mgr) || Number(mgr) <= 0)) {
        return `Ligne ${line}: manager_id doit être vide (manager racine) ou un entier strictement positif.`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfBirth.trim())) {
        return `Ligne ${line}: date_of_birth doit être au format YYYY-MM-DD.`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.hireDate.trim())) {
        return `Ligne ${line}: hire_date doit être au format YYYY-MM-DD.`;
      }
      const emailKey = row.email.trim().toLowerCase();
      if (emailKeys.has(emailKey)) {
        return `Ligne ${line}: email dupliqué dans le fichier (chaque collaborateur doit avoir un email unique, même prénom/nom).`;
      }
      emailKeys.add(emailKey);
    }
    return '';
  }

  private normalizeHeader(value: string): string {
    return value
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }
}