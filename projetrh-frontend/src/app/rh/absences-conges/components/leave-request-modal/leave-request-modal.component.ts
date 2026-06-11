import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AbsenceType,
  EmployeeProfile,
  LeaveBalance,
  LeaveConflict,
  LeavePolicy,
  LeaveRequest,
  LeaveRequestForm,
  TypeColorMap
} from '../../absences-conges.models';
import { LeaveRequestService } from '../../services/leave-request.service';
import { ToastService } from '../../../../components/toast/toast.service';

@Component({
  selector: 'app-leave-request-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-request-modal.component.html',
  styleUrl: './leave-request-modal.component.scss'
})
export class LeaveRequestModalComponent implements OnInit, OnDestroy {
  @Input() employees: EmployeeProfile[] = [];
  @Input() typeColors!: TypeColorMap;
  @Input() policies: LeavePolicy[] = [];
  @Input() balances: LeaveBalance[] = [];
  @Output() submitted = new EventEmitter<LeaveRequest>();
  @Output() closed = new EventEmitter<void>();

  private readonly leaveRequestService = inject(LeaveRequestService);
  private readonly toastService = inject(ToastService);

  form: LeaveRequestForm = {
    employeeId: null,
    type: '',
    startDate: '',
    endDate: '',
    notes: '',
    requestedDays: 0,
    balanceAfter: null
  };

  filteredEmployees: EmployeeProfile[] = [];
  employeeSearch = '';
  showEmployeeDropdown = false;
  conflicts: LeaveConflict[] = [];
  submitting = false;
  insufficientBalance = false;
  private submitSub?: Subscription;

  ngOnInit(): void {
    this.filteredEmployees = this.employees.slice(0, 10);
  }

  get activePolicies(): LeavePolicy[] {
    return this.policies.filter(p => p.isActive);
  }

  get isFormValid(): boolean {
    return !!(
      this.form.employeeId &&
      this.form.type &&
      this.form.startDate &&
      this.form.endDate &&
      this.form.requestedDays > 0 &&
      !this.insufficientBalance
    );
  }

  onEmployeeSearch(): void {
    const query = this.employeeSearch.toLowerCase();
    this.filteredEmployees = this.employees
      .filter(e => e.fullName.toLowerCase().includes(query))
      .slice(0, 10);
    this.showEmployeeDropdown = true;
  }

  selectEmployee(employee: EmployeeProfile): void {
    this.form.employeeId = employee.id;
    this.employeeSearch = employee.fullName;
    this.showEmployeeDropdown = false;
    this.recalculate();
  }

  closeEmployeeDropdownDelayed(): void {
    setTimeout(() => { this.showEmployeeDropdown = false; }, 150);
  }

  onDatesChanged(): void {
    this.recalculate();
    if (this.form.employeeId && this.form.startDate && this.form.endDate) {
      this.leaveRequestService.detectConflicts({
        employeeId: this.form.employeeId,
        startDate: this.form.startDate,
        endDate: this.form.endDate
      }).subscribe({
        next: (conflicts) => { this.conflicts = conflicts; },
        error: () => { this.conflicts = []; }
      });
    }
  }

  onTypeChanged(): void {
    this.recalculate();
  }

  private recalculate(): void {
    if (this.form.startDate && this.form.endDate) {
      this.form.requestedDays = this.countWorkingDays(this.form.startDate, this.form.endDate);
    } else {
      this.form.requestedDays = 0;
    }

    if (this.form.employeeId && this.form.type) {
      const balance = this.balances.find(
        b => b.employeeId === this.form.employeeId && b.type === this.form.type
      );
      if (balance) {
        this.form.balanceAfter = balance.remaining - this.form.requestedDays;
        this.insufficientBalance = this.form.balanceAfter < 0;
      } else {
        this.form.balanceAfter = null;
        this.insufficientBalance = false;
      }
    } else {
      this.form.balanceAfter = null;
      this.insufficientBalance = false;
    }
  }

  private countWorkingDays(startStr: string, endStr: string): number {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (end < start) return 0;
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  submit(): void {
    if (!this.isFormValid || this.submitting) return;
    this.submitting = true;
    this.submitSub = this.leaveRequestService.create({
      employeeId: this.form.employeeId!,
      type: this.form.type as AbsenceType,
      startDate: this.form.startDate,
      endDate: this.form.endDate,
      notes: this.form.notes || undefined
    }).subscribe({
      next: (request) => {
        this.submitting = false;
        this.submitted.emit(request);
      },
      error: (err) => {
        this.submitting = false;
        const msg = err?.error?.message ?? err?.message ?? 'Erreur lors de la soumission de la demande.';
        this.toastService.error(msg);
      }
    });
  }

  ngOnDestroy(): void {
    this.submitSub?.unsubscribe();
  }

  cancel(): void {
    if (this.submitting) {
      this.submitSub?.unsubscribe();
      this.submitting = false;
    }
    this.closed.emit();
  }

  getPolicyColor(type: AbsenceType | ''): string {
    if (!type) return '#9ca3af';
    return this.typeColors[type as AbsenceType]?.text ?? '#9ca3af';
  }
}
