import { Component, Input, inject, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AdjustLeaveBalanceDto,
  EmployeeProfile,
  LeaveBalance,
  TypeColorMap
} from '../../absences-conges.models';
import { LeaveBalanceService } from '../../services/leave-balance.service';
import { ToastService } from '../../../../components/toast/toast.service';

type SortField = 'name' | 'department' | 'entitled' | 'used' | 'pending' | 'remaining';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-leave-balance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-balance.component.html',
  styleUrl: './leave-balance.component.scss'
})
export class LeaveBalanceComponent implements OnChanges {
  @Input() employees: EmployeeProfile[] = [];
  @Input() typeColors!: TypeColorMap;
  @Input() balances: LeaveBalance[] = [];
  @Input() congePayeEntitled = 18;

  private readonly balanceService = inject(LeaveBalanceService);
  private readonly toastService = inject(ToastService);

  // Filters
  filterDepartment = ''; 

  // Sorting
  sortField: SortField = 'name';
  sortDir: SortDir = 'asc';

  // Pagination
  readonly PAGE_SIZE = 8;
  currentPage = 1;

  // Adjust modal
  adjustModalOpen = false;
  adjustingBalance: LeaveBalance | null = null;
  adjustmentValue = 0;
  adjustmentReason = '';

  ngOnChanges(): void {
    // Reset to page 1 when data changes
    this.currentPage = 1;
  }

  get departments(): string[] {
    return [...new Set(this.employees.map(e => e.department))].sort();
  }

  get filteredSortedBalances(): LeaveBalance[] {
    let result = this.balances.filter(b => {
      const employee = this.employees.find(e => e.id === b.employeeId);
      if (this.filterDepartment && employee?.department !== this.filterDepartment) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      switch (this.sortField) {
        case 'name':
          valA = this.getEmployeeName(a.employeeId).toLowerCase();
          valB = this.getEmployeeName(b.employeeId).toLowerCase();
          break;
        case 'department':
          valA = this.getEmployeeDepartment(a.employeeId).toLowerCase();
          valB = this.getEmployeeDepartment(b.employeeId).toLowerCase();
          break;
        case 'entitled':  valA = a.entitled;  valB = b.entitled;  break;
        case 'used':      valA = a.used;      valB = b.used;      break;
        case 'pending':   valA = a.pending;   valB = b.pending;   break;
        case 'remaining': valA = a.remaining; valB = b.remaining; break;
        default:          valA = ''; valB = '';
      }
      if (valA < valB) return this.sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSortedBalances.length / this.PAGE_SIZE));
  }

  get pagedBalances(): LeaveBalance[] {
    const start = (this.currentPage - 1) * this.PAGE_SIZE;
    return this.filteredSortedBalances.slice(start, start + this.PAGE_SIZE);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get employeesWithCriticalBalance(): LeaveBalance[] {
    return this.balances.filter(b => b.remaining < 5);
  }

  setSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
    this.currentPage = 1;
  }

  onFilterChange(): void {
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  getEmployeeName(employeeId: number): string {
    return this.employees.find(e => e.id === employeeId)?.fullName ?? `collaborateur #${employeeId}`;
  }

  getEmployeeDepartment(employeeId: number): string {
    return this.employees.find(e => e.id === employeeId)?.department ?? 'N/A';
  }

  getBalanceStatusClass(balance: LeaveBalance): string {
    if (balance.remaining < 5) return 'critical';
    if (balance.remaining < 10) return 'warning';
    return 'ok';
  }

  getProgressPercent(balance: LeaveBalance): number {
    if (balance.entitled + balance.carryOver <= 0) return 0;
    return Math.min(100, (balance.used / (balance.entitled + balance.carryOver)) * 100);
  }

  getSortIcon(field: SortField): string {
    if (this.sortField !== field) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  getPageEnd(): number {
    return Math.min(this.currentPage * this.PAGE_SIZE, this.filteredSortedBalances.length);
  }

  // --- Adjust modal ---
  openAdjust(balance: LeaveBalance): void {
    this.adjustingBalance = balance;
    this.adjustmentValue = 0;
    this.adjustmentReason = '';
    this.adjustModalOpen = true;
  }

  closeAdjustModal(): void {
    this.adjustModalOpen = false;
    this.adjustingBalance = null;
  }

  confirmAdjust(): void {
    if (!this.adjustingBalance) return;
    if (!this.adjustmentReason.trim() || this.adjustmentReason.length < 5) return;
    const dto: AdjustLeaveBalanceDto = {
      adjustment: this.adjustmentValue,
      reason: this.adjustmentReason
    };
    this.balanceService.adjust(this.adjustingBalance.id, dto).subscribe({
      next: (updated) => {
        // Update balance in list
        const idx = this.balances.findIndex(b => b.id === updated.id);
        if (idx !== -1) this.balances[idx] = updated;
        this.toastService.success('Solde ajusté avec succès.');
        this.closeAdjustModal();
      },
      error: (err) => {
        this.toastService.error(err?.error?.message ?? 'Erreur lors de l\'ajustement.');
      }
    });
  }

  exportExcel(): void {
    import('xlsx/xlsx.mjs').then((XLSX) => {
      const headers = ['Collaborateur', 'Département', 'Type', 'Acquis', 'Pris', 'En attente', 'Restant', 'Report'];
      const rows = this.filteredSortedBalances.map(b => [
        this.getEmployeeName(b.employeeId),
        this.getEmployeeDepartment(b.employeeId),
        this.typeColors[b.type]?.label ?? b.type,
        b.entitled, b.used, b.pending, b.remaining, b.carryOver
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Soldes Congés');
      XLSX.writeFile(wb, 'soldes-conges.xlsx');
    });
  }
}
