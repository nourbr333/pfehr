import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { Department, DepartmentService } from '../../../services/department.service';
import { Employee, EmployeeService, EmployeeUpdatePayload } from '../../../services/employee.service';
import { ToastService } from '../../../components/toast/toast.service';

interface EmployeeEditForm {
  firstName: string;
  lastName: string;
  jobTitle: string;
  departmentId: number | null;
  managerId: string;
  isManager: boolean;
}

@Component({
  selector: 'app-admin-rh-employees-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-rh-employees-panel.component.html',
  styleUrl: './admin-rh-employees-panel.component.scss'
})
export class AdminRhEmployeesPanelComponent implements OnInit {
  employees: Employee[] = [];
  departments: Department[] = [];
  loading = true;

  searchTerm = '';
  selectedDepartmentId: number | null = null;

  readonly pageSize = 8;
  currentPage = 1;

  showEditModal = false;
  isSaving = false;
  editError = '';
  employeeBeingEdited: Employee | null = null;
  editForm: EmployeeEditForm = {
    firstName: '',
    lastName: '',
    jobTitle: '',
    departmentId: null,
    managerId: '',
    isManager: false
  };

  deleteConfirmId: number | null = null;
  isDeleting = false;

  constructor(
    private employeeService: EmployeeService,
    private departmentService: DepartmentService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  private refresh(): void {
    this.loading = true;
    forkJoin({
      employees: this.employeeService.getAllEmployees(),
      departments: this.departmentService.getAllDepartments()
    }).subscribe({
      next: ({ employees, departments }) => {
        this.employees = employees;
        this.departments = departments;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Impossible de charger les collaborateurs.');
      }
    });
  }

  get filteredEmployees(): Employee[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.employees.filter((e) => {
      if (this.selectedDepartmentId != null && e.departmentId !== this.selectedDepartmentId) return false;
      if (!term) return true;
      const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
      return fullName.includes(term) || (e.jobTitle ?? '').toLowerCase().includes(term);
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredEmployees.length / this.pageSize));
  }

  get pagedEmployees(): Employee[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredEmployees.slice(start, start + this.pageSize);
  }

  onFilterChange(): void {
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) this.currentPage = page;
  }

  managerNameOf(employee: Employee): string {
    if (employee.managerId == null) return '—';
    const manager = this.employees.find((e) => e.employeeId === employee.managerId);
    return manager ? `${manager.firstName} ${manager.lastName}` : `#${employee.managerId}`;
  }

  departmentNameOf(employee: Employee): string {
    return employee.departmentName || '—';
  }

  openEdit(employee: Employee): void {
    this.employeeBeingEdited = employee;
    this.editForm = {
      firstName: employee.firstName ?? '',
      lastName: employee.lastName ?? '',
      jobTitle: employee.jobTitle ?? '',
      departmentId: employee.departmentId ?? null,
      managerId: employee.managerId == null ? '' : String(employee.managerId),
      isManager: employee.isManager ?? false
    };
    this.editError = '';
    this.showEditModal = true;
  }

  closeEdit(): void {
    if (this.isSaving) return;
    this.showEditModal = false;
    this.employeeBeingEdited = null;
  }

  saveEdit(): void {
    if (!this.employeeBeingEdited) return;
    const firstName = this.editForm.firstName.trim();
    const lastName = this.editForm.lastName.trim();
    const jobTitle = this.editForm.jobTitle.trim();
    if (!firstName || !lastName || !jobTitle || this.editForm.departmentId == null) {
      this.editError = 'Les champs prénom, nom, poste et département sont obligatoires.';
      return;
    }
    const managerIdValue = this.editForm.managerId.trim();
    if (managerIdValue !== '' && !/^\d+$/.test(managerIdValue)) {
      this.editError = 'Le manager doit être vide ou un identifiant numérique.';
      return;
    }
    const managerId = managerIdValue === '' ? null : Number(managerIdValue);
    if (managerId != null && managerId === this.employeeBeingEdited.employeeId) {
      this.editError = 'Un collaborateur ne peut pas être son propre manager.';
      return;
    }

    const payload: EmployeeUpdatePayload = {
      firstName,
      lastName,
      jobTitle,
      departmentId: this.editForm.departmentId,
      managerId,
      isManager: this.editForm.isManager
    };

    this.isSaving = true;
    this.editError = '';
    this.employeeService.updateEmployee(this.employeeBeingEdited.employeeId, payload).pipe(
      finalize(() => { this.isSaving = false; })
    ).subscribe({
      next: () => {
        this.toast.success(`Collaborateur ${firstName} ${lastName} modifié avec succès.`);
        this.showEditModal = false;
        this.employeeBeingEdited = null;
        this.refresh();
      },
      error: (error) => {
        const raw = error?.error;
        this.editError = (typeof raw === 'string' ? raw : null) ?? raw?.message ?? 'Modification impossible.';
      }
    });
  }

  askDelete(employee: Employee): void {
    this.deleteConfirmId = employee.employeeId;
  }

  cancelDelete(): void {
    this.deleteConfirmId = null;
  }

  confirmDelete(employee: Employee): void {
    this.isDeleting = true;
    this.employeeService.deleteEmployee(employee.employeeId).pipe(
      finalize(() => { this.isDeleting = false; })
    ).subscribe({
      next: () => {
        this.toast.success(`Collaborateur ${employee.firstName} ${employee.lastName} supprimé.`);
        this.deleteConfirmId = null;
        this.refresh();
      },
      error: (error) => {
        const raw = error?.error;
        const message = (typeof raw === 'string' ? raw : null) ?? raw?.message ?? 'Suppression impossible.';
        this.toast.error(message);
        this.deleteConfirmId = null;
      }
    });
  }
}
