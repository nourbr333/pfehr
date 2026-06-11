import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminUser } from '../../services/admin.service';

@Component({
  selector: 'app-modal-confirm-delete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modal-confirm-delete.component.html',
  styleUrl: './modal-confirm-delete.component.scss'
})
export class ModalConfirmDeleteComponent {
  @Input({ required: true }) user!: AdminUser;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirmDelete = new EventEmitter<void>();

  confirmEmail = '';

  get canConfirm(): boolean {
    return this.confirmEmail.trim() === this.user.email.trim();
  }

  onConfirm(): void {
    if (!this.canConfirm) return;
    this.confirmDelete.emit();
  }

  fullNameOf(): string {
    const nom = (this.user?.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (this.user?.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }
}

