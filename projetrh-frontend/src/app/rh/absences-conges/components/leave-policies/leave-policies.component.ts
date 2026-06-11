import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeavePolicy } from '../../absences-conges.models';
import { LeavePolicyService } from '../../services/leave-policy.service';
import { ToastService } from '../../../../components/toast/toast.service';

@Component({
  selector: 'app-leave-policies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leave-policies.component.html',
  styleUrl: './leave-policies.component.scss'
})
export class LeavePoliciesComponent {
  @Input() policies: LeavePolicy[] = [];
  @Output() policySaved = new EventEmitter<LeavePolicy>();

  private readonly policyService = inject(LeavePolicyService);
  private readonly toastService = inject(ToastService);

  editingId: number | null = null;
  editForm: Partial<LeavePolicy> = {};
  saving = false;

  get congePayePolicy(): LeavePolicy | undefined {
    return this.policies.find(p => p.type === 'conge-paye');
  }

  get motifPolicies(): LeavePolicy[] {
    return this.policies.filter(p => p.type !== 'conge-paye');
  }

  startEdit(policy: LeavePolicy): void {
    this.editingId = policy.id;
    this.editForm = { ...policy };
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editForm = {};
  }

  isModified(policy: LeavePolicy): boolean {
    if (this.editingId !== policy.id) return false;
    return (
      this.editForm.maxDaysPerYear !== policy.maxDaysPerYear ||
      this.editForm.requiresDocument !== policy.requiresDocument ||
      this.editForm.isActive !== policy.isActive
    );
  }

  isValid(): boolean {
    const f = this.editForm;
    if (!f.maxDaysPerYear || f.maxDaysPerYear < 1 || f.maxDaysPerYear > 365) return false;
    return true;
  }

  save(): void {
    if (!this.editingId || !this.isValid() || this.saving) return;
    this.saving = true;
    const dto: Partial<LeavePolicy> = {
      maxDaysPerYear: this.editForm.maxDaysPerYear,
      requiresDocument: this.editForm.requiresDocument,
      isActive: this.editForm.isActive
    };
    this.policyService.update(this.editingId, dto).subscribe({
      next: (updated) => {
        this.saving = false;
        this.editingId = null;
        this.toastService.success('Politique mise à jour.');
        this.policySaved.emit(updated);
      },
      error: (err) => {
        this.saving = false;
        this.toastService.error(err?.error?.message ?? 'Erreur lors de la sauvegarde.');
      }
    });
  }
}
