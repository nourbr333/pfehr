import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminRole, AdminUser, AdminUserRole } from '../../services/admin.service';

@Component({
  selector: 'app-modal-role',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modal-role.component.html',
  styleUrl: './modal-role.component.scss'
})
export class ModalRoleComponent {
  @Input({ required: true }) user!: AdminUser;
  @Input() roles: AdminRole[] = [];

  @Output() cancel = new EventEmitter<void>();
  @Output() confirmRole = new EventEmitter<AdminUserRole>();

  selectedRole: AdminUserRole;

  constructor() {
    this.selectedRole = 'MANAGER';
  }

  ngOnInit(): void {
    this.selectedRole = this.user?.role ?? 'MANAGER';
  }

  permissionsText(role: AdminUserRole): string {
    const r = this.roles.find(x => x.nom === role);
    if (!r) return '';
    return r.permissions.join(' · ');
  }

  roleBadgeClass(role: AdminUserRole): string {
    if (role === 'ADMIN') return 'role-badge role-badge-admin';
    if (role === 'MANAGER') return 'role-badge role-badge-manager';
    return 'role-badge role-badge-resp';
  }

  roleLabel(role: AdminUserRole): string {
    if (role === 'ADMIN') return 'Admin';
    if (role === 'MANAGER') return 'Manager';
    return 'Responsable RH';
  }

  fullNameOf(): string {
    const nom = (this.user?.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (this.user?.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }
}

