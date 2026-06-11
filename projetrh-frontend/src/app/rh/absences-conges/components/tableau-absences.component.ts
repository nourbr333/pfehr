import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmployeeTableRow, TypeColorMap } from '../absences-conges.models';

type SortKey = 'employeeName' | 'department' | 'absenceDays' | 'absenteeismRate' | 'presenceRate' | 'trend';

@Component({
  selector: 'app-tableau-absences',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tableau-absences.component.html',
  styleUrl: './tableau-absences.component.scss'
})
export class TableauAbsencesComponent implements OnChanges {
  @Input({ required: true }) rows: EmployeeTableRow[] = [];
  @Input({ required: true }) typeColors!: TypeColorMap;

  pageSize = 8;
  currentPage = 1;
  sortKey: SortKey = 'absenceDays';
  sortDirection: 'asc' | 'desc' = 'desc';
  selectedRow: EmployeeTableRow | null = null;
  searchQuery = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) {
      this.currentPage = 1;
      this.selectedRow = null;
      this.searchQuery = '';
    }
  }

  get filteredRows(): EmployeeTableRow[] {
    const q = this.searchQuery.trim().toLowerCase();
    const sorted = [...this.rows].sort((left, right) => this.compare(left, right));
    if (!q) return sorted;
    return sorted.filter(r => r.employeeName.toLowerCase().includes(q));
  }

  get pagedRows(): EmployeeTableRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize));
  }

  get matchCount(): number {
    return this.filteredRows.length;
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  toggleSort(key: SortKey): void {
    if (this.sortKey === key) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDirection = key === 'employeeName' || key === 'department' ? 'asc' : 'desc';
    }
    this.currentPage = 1;
  }

  sortArrow(key: SortKey): string {
    if (this.sortKey !== key) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  firstPage(): void {
    this.currentPage = 1;
  }

  previousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  nextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  lastPage(): void {
    this.currentPage = this.totalPages;
  }

  selectRow(row: EmployeeTableRow): void {
    this.selectedRow = row;
  }

  closeDrawer(): void {
    this.selectedRow = null;
  }

  presenceBarClass(rate: number): string {
    if (rate >= 75) return 'bar-ok';
    if (rate >= 65) return 'bar-warning';
    return 'bar-danger';
  }

  trendDelta(row: EmployeeTableRow): number {
    return Number((row.presenceRate - row.previousPresenceRate).toFixed(1));
  }

  trendClass(row: EmployeeTableRow): string {
    return this.trendDelta(row) >= 0 ? 'down' : 'up';
  }

  private compare(left: EmployeeTableRow, right: EmployeeTableRow): number {
    const leftValue = this.value(left);
    const rightValue = this.value(right);
    const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    return this.sortDirection === 'asc' ? result : -result;
  }

  private value(row: EmployeeTableRow): number | string {
    if (this.sortKey === 'trend') return this.trendDelta(row);
    return row[this.sortKey];
  }
}
