import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminRole, AdminUser, AdminUserRole, AdminUserStatut } from '../../services/admin.service';

export interface UtilisateurFormPayload {
  nom: string;
  prenom: string;
  email: string;
  role: AdminUserRole;
  statut: AdminUserStatut;
  validated: boolean;
  password?: string;
}

@Component({
  selector: 'app-modal-utilisateur',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modal-utilisateur.component.html',
  styleUrl: './modal-utilisateur.component.scss'
})
export class ModalUtilisateurComponent implements OnInit {
  @Input({ required: true }) mode: 'add' | 'edit' = 'add';
  @Input() roles: AdminRole[] = [];
  @Input() existingUsers: AdminUser[] = [];
  @Input() user: AdminUser | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() submit = new EventEmitter<UtilisateurFormPayload>();

  // Form state
  prenom = '';
  nom = '';
  email = '';

  role: AdminUserRole = 'MANAGER';
  statut: AdminUserStatut = 'actif';
  validated = false;

  // Password (add mode)
  password = '';
  showPassword = false;

  // Password (edit mode)
  modifyPassword = false;
  newPassword = '';
  showNewPassword = false;

  constructor() {}

  get emailValid(): boolean {
    const e = this.email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  get emailDuplicate(): boolean {
    const normalized = this.email.trim().toLowerCase();
    if (!normalized) return false;

    const userId = this.user?.id;
    return this.existingUsers.some(u => u.email.trim().toLowerCase() === normalized && u.id !== userId);
  }

  passwordStrengthScore(pw: string): number {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  strengthColor(score: number): { bg: string; border: string; fill: string } {
    if (score <= 1) return { bg: '#fee2e2', border: '#ef4444', fill: '#ef4444' };
    if (score === 2) return { bg: '#ffedd5', border: '#f59e0b', fill: '#f59e0b' };
    return { bg: '#dcfce7', border: '#22c55e', fill: '#22c55e' };
  }

  get addPasswordScore(): number {
    return this.passwordStrengthScore(this.password);
  }

  get newPasswordScore(): number {
    return this.passwordStrengthScore(this.newPassword);
  }

  private initFromUser(): void {
    if (!this.user) return;
    const fullName = this.fullNameOfUser(this.user);
    const parts = fullName.split(/\s+/).filter(Boolean);
    const first = parts[0] ?? this.user.prenom;
    const last = parts.length > 1 ? parts[parts.length - 1] : this.user.nom;

    this.prenom = first;
    this.nom = last;
    this.email = this.user.email;
    this.role = this.user.role;
    this.statut = this.user.statut;
    this.validated = this.user.validated;
  }

  fullNameOfUser(u: AdminUser | null | undefined): string {
    const nom = (u?.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (u?.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }

  ngOnInit(): void {
    if (this.mode === 'add') {
      this.validated = false; // défaut : en attente
      this.statut = 'actif';
      return;
    }
    this.initFromUser();
    this.password = '';
    this.modifyPassword = false;
    this.newPassword = '';
  }

  get canSubmit(): boolean {
    if (!this.prenom.trim() || !this.nom.trim()) return false;
    if (!this.emailValid || this.emailDuplicate) return false;
    if (!this.role) return false;

    if (this.mode === 'add') {
      const score = this.passwordStrengthScore(this.password);
      return score === 4;
    }

    if (this.mode === 'edit') {
      if (!this.modifyPassword) return true;
      const score = this.passwordStrengthScore(this.newPassword);
      return score === 4;
    }

    return false;
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    const password =
      this.mode === 'add'
        ? this.password
        : (this.modifyPassword ? this.newPassword : undefined);

    this.submit.emit({
      prenom: this.prenom.trim(),
      nom: this.nom.trim(),
      email: this.email.trim(),
      role: this.role,
      statut: this.statut,
      validated: this.validated,
      password
    });
  }
}

