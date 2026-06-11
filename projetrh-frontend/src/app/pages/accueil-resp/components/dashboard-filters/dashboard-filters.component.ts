import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Department } from '../../../../services/department.service';

export type DashboardPeriod = 'month' | 'quarter' | 'year';

@Component({
  selector: 'app-dashboard-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-filters.component.html',
  styleUrl: './dashboard-filters.component.scss'
})
export class DashboardFiltersComponent {
  @Input() departments: Department[] = [];
  @Input() selectedDepartmentId: number | null = null;
  @Input() selectedPeriod: DashboardPeriod = 'month';
  @Input() showDepartmentFilter = true;

  @Output() periodChanged = new EventEmitter<DashboardPeriod>();
  @Output() departmentChanged = new EventEmitter<number | null>();
  @Output() exportClicked = new EventEmitter<void>();

  onPeriodClick(period: DashboardPeriod): void {
    if (period === this.selectedPeriod) return;
    this.periodChanged.emit(period);
  }

  onDepartmentChange(departmentId: number | null): void {
    this.departmentChanged.emit(departmentId);
  }
}
