import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EmployeeProfile,
  LeaveBalance,
  LeaveConflict,
  LeaveRequest,
  LeaveStatus,
  TypeColorMap
} from '../../absences-conges.models';

@Component({
  selector: 'app-conges-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conges-requests.component.html',
  styleUrl: './conges-requests.component.scss'
})
export class CongesRequestsComponent implements OnChanges {
  @Input() employees: EmployeeProfile[] = [];
  @Input() typeColors!: TypeColorMap;
  @Input() leaveRequests: LeaveRequest[] = [];
  @Input() leaveBalances: LeaveBalance[] = [];
  /** Affiche l'historique sous forme de tableau compact (vue admin) au lieu des cartes groupées par mois. */
  @Input() compactHistory = false;
  @Output() requestApproved = new EventEmitter<{ id: number; status: LeaveStatus }>();
  @Output() requestRejected = new EventEmitter<{ id: number; status: LeaveStatus; reason?: string }>();
  @Output() requestCancelled = new EventEmitter<{ id: number; status: LeaveStatus }>();
  @Output() newRequest = new EventEmitter<void>();

  filterDepartment = '';
  filterStatus: LeaveStatus | '' = '';
  rejectionReasonMap: Record<number, string> = {};
  showRejectInputFor: number | null = null;

  get departments(): string[] {
    const fromEmployees = this.employees.map(e => e.department);
    const fromRequests = this.leaveRequests.map(r => r.department).filter((d): d is string => !!d);
    return [...new Set([...fromEmployees, ...fromRequests])].sort();
  }

  get pendingRequests(): LeaveRequest[] {
    // Exclure les demandes effectivement échuées (startDate dépassée sans réponse)
    return this.leaveRequests.filter(r => r.status === 'pending' && !this.isExpired(r));
  }

  get sortedPendingRequests(): LeaveRequest[] {
    if (this.filterStatus && this.filterStatus !== 'pending') return [];
    return [...this.pendingRequests]
      .filter(r => {
        if (this.isExpired(r)) return false; // déplacé vers historique
        if (this.filterDepartment && r.department !== this.filterDepartment) return false;
        return true;
      })
      .sort((a, b) => {
        const urgA = this.isUrgent(a) ? 0 : 1;
        const urgB = this.isUrgent(b) ? 0 : 1;
        if (urgA !== urgB) return urgA - urgB;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });
  }

  get filteredRequests(): LeaveRequest[] {
    return this.leaveRequests.filter(r => {
      if (this.filterDepartment && r.department !== this.filterDepartment) return false;
      if (this.filterStatus && this.effectiveStatus(r) !== this.filterStatus) return false;
      return true;
    });
  }

  readonly historyInitialCount = 10;
  historyDisplayCount = this.historyInitialCount;

  private get allHistoryRequests(): LeaveRequest[] {
    return this.leaveRequests
      .filter(r => r.status !== 'pending' || this.isExpired(r))
      .filter(r => r.status !== 'draft')
      .filter(r => {
        if (this.filterDepartment && r.department !== this.filterDepartment) return false;
        if (this.filterStatus && this.effectiveStatus(r) !== this.filterStatus) return false;
        return true;
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  get historyRequests(): LeaveRequest[] {
    return this.allHistoryRequests.slice(0, this.historyDisplayCount);
  }

  get historyGroupedByMonth(): { monthKey: string; monthLabel: string; requests: LeaveRequest[] }[] {
    const visibleRequests = this.historyRequests;
    const groups = new Map<string, LeaveRequest[]>();
    for (const req of visibleRequests) {
      const [year, month] = req.startDate.split('-');
      const key = `${year}-${month}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(req);
    }
    return Array.from(groups.entries()).map(([key, requests]) => {
      const [year, month] = key.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      const monthLabel = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return { monthKey: key, monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), requests };
    });
  }

  get historyTotal(): number {
    return this.leaveRequests
      .filter(r => (r.status !== 'pending' || this.isExpired(r)) && r.status !== 'draft')
      .filter(r => {
        if (this.filterDepartment && r.department !== this.filterDepartment) return false;
        if (this.filterStatus && this.effectiveStatus(r) !== this.filterStatus) return false;
        return true;
      }).length;
  }

  get showHistoryToggle(): boolean {
    return this.historyTotal > this.historyInitialCount;
  }

  get isHistoryExpanded(): boolean {
    return this.historyDisplayCount >= this.historyTotal;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['leaveRequests']) {
      this.resetHistoryDisplay();
    }
  }

  toggleHistoryDisplay(): void {
    this.historyDisplayCount = this.isHistoryExpanded
      ? this.historyInitialCount
      : this.historyTotal;
  }

  resetHistoryDisplay(): void {
    this.historyDisplayCount = this.historyInitialCount;
  }

  isUrgent(request: LeaveRequest): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(request.startDate);
    const diffDays = Math.ceil((start.getTime() - today.getTime()) / 86400000);
    // Count working days
    let workingDays = 0;
    const cursor = new Date(today);
    while (cursor < start && workingDays < 4) {
      const d = cursor.getDay();
      if (d !== 0 && d !== 6) workingDays++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return workingDays <= 3 && diffDays >= 0;
  }

  getEmployeeBalance(request: LeaveRequest): number | null {
    const balance = this.leaveBalances.find(
      b => b.employeeId === request.employeeId && b.type === request.type
    );
    return balance?.remaining ?? null;
  }

  approve(request: LeaveRequest): void {
    this.requestApproved.emit({ id: request.id, status: 'approved' });
  }

  cancel(request: LeaveRequest): void {
    this.requestCancelled.emit({ id: request.id, status: 'cancelled' });
  }

  showRejectInput(request: LeaveRequest): void {
    this.showRejectInputFor = request.id;
    if (!this.rejectionReasonMap[request.id]) {
      this.rejectionReasonMap[request.id] = '';
    }
  }

  confirmReject(request: LeaveRequest): void {
    const reason = this.rejectionReasonMap[request.id]?.trim();
    if (!reason) return;
    this.requestRejected.emit({ id: request.id, status: 'rejected', reason });
    this.showRejectInputFor = null;
  }

  cancelReject(): void {
    this.showRejectInputFor = null;
  }

  detectConflicts(request: LeaveRequest): LeaveConflict[] {
    if (!request.conflictsDetected || !request.conflictDetails) return [];
    return request.conflictDetails;
  }

  getStatusLabel(status: LeaveStatus): string {
    const map: Record<LeaveStatus, string> = {
      draft: 'Brouillon',
      pending: 'En attente',
      approved: 'Approuvé',
      rejected: 'Rejeté',
      cancelled: 'Annulé',
      expired: 'Arrivé à échéance'
    };
    return map[status];
  }

  getStatusClass(status: LeaveStatus): string {
    return `status-${status}`;
  }

  isExpired(request: LeaveRequest): boolean {
    if (request.status === 'expired') return true;
    // Seules les demandes 'pending' peuvent être effectivement expirées par dépassement de date
    if (request.status !== 'pending') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Parsing en heure locale (évite les décalages UTC+ qui rendraient la date J-1 en soirée)
    const [y, m, d] = request.startDate.split('-').map(Number);
    return new Date(y, m - 1, d) < today;
  }

  /** Retourne 'expired' si la demande est échuée (date dépassée ou statut DB = expired),
   *  sinon retourne le statut réel. Utiliser partout à la place de request.status. */
  effectiveStatus(request: LeaveRequest): LeaveStatus {
    return this.isExpired(request) ? 'expired' : request.status;
  }
}
