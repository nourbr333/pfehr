import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, Utilisateur } from '../../services/auth';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

@Component({
  selector: 'app-profil',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent],
  templateUrl: './profil.html',
  styleUrl: './profil.scss'
})
export class ProfilComponent {
  utilisateur: Utilisateur | null;
  editingField: string | null = null;
  editValue = '';
  fieldSuccess: string | null = null;
  showCurrentPw = false;
  showNewPw = false;
  showConfirmPw = false;
  passwordSuccess = false;
  passwordForm: FormGroup;

  fieldError: string | null = null;
  fieldStatusField: string | null = null;

  private fieldSuccessTimeout?: number;
  private passwordSuccessTimeout?: number;

  constructor(
    private router: Router,
    private auth: AuthService,
    private fb: FormBuilder
  ) {
    this.utilisateur = this.auth.getCurrentUser();

    if (!this.utilisateur) {
      this.router.navigate(['/login']);
    }

    this.passwordForm = this.fb.group(
      {
        currentPw: ['', Validators.required],
        newPw: ['', [Validators.required, Validators.minLength(8)]],
        confirmPw: ['', Validators.required]
      },
      { validators: this.passwordValidator }
    );
  }

  get dashboardRoute(): string {
    return this.utilisateur?.route ?? '/login';
  }

  get isAdmin(): boolean {
    return this.normalizedRole === 'ADMIN';
  }

  get isManager(): boolean {
    return this.normalizedRole === 'MANAGER';
  }

  get isResponsableRh(): boolean {
    return this.normalizedRole === 'RESPONSABLE_RH';
  }

  get portalLabel(): string {
    if (this.isAdmin) return 'Portail Admin';
    if (this.isManager) return 'Portail Manager';
    return 'Portail Responsable RH';
  }

  get passwordStrength(): number {
    const value = String(this.passwordForm.get('newPw')?.value ?? '');
    if (!value) return 0;

    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return score;
  }

  get strengthLabel(): string {
    if (this.passwordStrength <= 1) return 'Faible';
    if (this.passwordStrength === 2) return 'Moyen';
    if (this.passwordStrength === 3) return 'Fort';
    return 'Très fort';
  }

  get strengthColor(): string {
    if (this.passwordStrength <= 1) return '#ef4444';
    if (this.passwordStrength === 2) return '#f59e0b';
    if (this.passwordStrength === 3) return '#eab308';
    return this.passwordStrength === 4 ? '#166534' : '#22c55e';
  }

  getRoleLabel(): string {
    switch (this.normalizedRole) {
      case 'ADMIN':
        return 'Admin';
      case 'MANAGER':
        return 'Manager';
      case 'RESPONSABLE_RH':
        return 'Responsable RH';
      default:
        return this.utilisateur?.role ?? '—';
    }
  }

  getBadgeClass(): string {
    switch (this.normalizedRole) {
      case 'ADMIN':
        return 'role-badge role-badge-admin';
      case 'MANAGER':
        return 'role-badge role-badge-manager';
      case 'RESPONSABLE_RH':
        return 'role-badge role-badge-rh';
      default:
        return 'role-badge';
    }
  }

  startEdit(field: string): void {
    if (!this.utilisateur) return;
    this.editingField = field;
    this.editValue = this.getFieldValue(field);
    this.fieldError = null;
    this.fieldSuccess = null;
    this.fieldStatusField = null;
  }

  cancelEdit(): void {
    this.editingField = null;
    this.editValue = '';
    this.fieldError = null;
    this.fieldStatusField = null;
  }

  saveEdit(field: string): void {
    if (!this.utilisateur) return;

    const value = this.editValue.trim();
    this.fieldError = null;
    this.fieldSuccess = null;
    this.fieldStatusField = field;

    if (!value) {
      this.fieldError = `${this.getFieldLabel(field)} requis`;
      return;
    }

    if (field === 'email' && !this.isEmailValid(value)) {
      this.fieldError = 'Format email invalide';
      return;
    }

    if (field === 'nom') this.utilisateur.nom = value;
    if (field === 'prenom') this.utilisateur.prenom = value;
    if (field === 'email') this.utilisateur.email = value;

    this.utilisateur.initiales = this.computeInitials(this.utilisateur.prenom, this.utilisateur.nom);
    this.fieldSuccess = `${this.getFieldLabel(field)} mis à jour`;
    this.editingField = null;
    this.editValue = '';

    if (this.fieldSuccessTimeout) {
      window.clearTimeout(this.fieldSuccessTimeout);
    }
    this.fieldSuccessTimeout = window.setTimeout(() => {
      this.fieldSuccess = null;
      this.fieldStatusField = null;
    }, 2000);
  }

  onChangePassword(): void {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) return;

    this.passwordSuccess = true;
    this.passwordForm.reset();
    this.showCurrentPw = false;
    this.showNewPw = false;
    this.showConfirmPw = false;

    if (this.passwordSuccessTimeout) {
      window.clearTimeout(this.passwordSuccessTimeout);
    }
    this.passwordSuccessTimeout = window.setTimeout(() => {
      this.passwordSuccess = false;
    }, 3000);
  }

  getPasswordError(controlName: 'currentPw' | 'newPw' | 'confirmPw'): string | null {
    const control = this.passwordForm.get(controlName);
    if (!control || !(control.touched || control.dirty)) return null;

    if (control.hasError('required')) {
      return 'Champ requis';
    }

    if (controlName === 'newPw' && control.hasError('minlength')) {
      return 'Minimum 8 caractères';
    }

    if (controlName === 'newPw' && this.passwordForm.hasError('sameAsCurrent')) {
      return 'Le nouveau mot de passe doit être différent de l’actuel';
    }

    if (controlName === 'confirmPw' && this.passwordForm.hasError('passwordMismatch')) {
      return 'La confirmation doit correspondre au nouveau mot de passe';
    }

    return null;
  }

  onNotifications(): void {}

  onDeconnexion(): void {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  private get normalizedRole(): 'ADMIN' | 'MANAGER' | 'RESPONSABLE_RH' | 'UNKNOWN' {
    const role = String(this.utilisateur?.role ?? '').toUpperCase();
    if (role.includes('RH')) return 'RESPONSABLE_RH';
    if (role.includes('MANAGER')) return 'MANAGER';
    if (role.includes('ADMIN')) return 'ADMIN';
    return 'UNKNOWN';
  }

  private getFieldValue(field: string): string {
    if (!this.utilisateur) return '';
    if (field === 'nom') return this.utilisateur.nom;
    if (field === 'prenom') return this.utilisateur.prenom;
    if (field === 'email') return this.utilisateur.email;
    return '';
  }

  private getFieldLabel(field: string): string {
    if (field === 'nom') return 'Nom';
    if (field === 'prenom') return 'Prénom';
    if (field === 'email') return 'Email';
    return 'Champ';
  }

  private isEmailValid(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private computeInitials(prenom: string, nom: string): string {
    const first = prenom?.trim()?.[0] ?? '';
    const last = nom?.trim()?.[0] ?? '';
    return `${first}${last}`.toUpperCase() || '??';
  }

  private passwordValidator = (group: AbstractControl): ValidationErrors | null => {
    const currentPw = String(group.get('currentPw')?.value ?? '');
    const newPw = String(group.get('newPw')?.value ?? '');
    const confirmPw = String(group.get('confirmPw')?.value ?? '');
    const errors: ValidationErrors = {};

    if (currentPw && newPw && currentPw === newPw) {
      errors['sameAsCurrent'] = true;
    }

    if (confirmPw && newPw && confirmPw !== newPw) {
      errors['passwordMismatch'] = true;
    }

    return Object.keys(errors).length ? errors : null;
  };
}