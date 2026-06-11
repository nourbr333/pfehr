import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SidebarAdminComponent } from '../../components/sidebar-admin/sidebar-admin.component';
import { ToastService } from '../../components/toast/toast.service';
import {
  AdminRole,
  AdminService,
  AdminUser,
  AdminUserMutationPayload,
  AdminUserRole,
  AdminUserStatut
} from '../../services/admin.service';
import { ModalConfirmDeleteComponent } from '../admin-modals/modal-confirm-delete.component';
import { ModalResetPasswordComponent } from '../admin-modals/modal-reset-password.component';
import { ModalRoleComponent } from '../admin-modals/modal-role.component';
import { ModalUtilisateurComponent, UtilisateurFormPayload } from '../admin-modals/modal-utilisateur.component';
import { forkJoin } from 'rxjs';

type FilterOption = '' | 'ADMIN' | 'MANAGER' | 'RESPONSABLE_RH';
type StatutOption = '' | AdminUserStatut;
type ValidationOption = '' | 'VALIDÉ' | 'NON_VALIDÉ';

type SortKey = 'nom' | 'role' | 'statut' | 'derniereConnexion';
type SortDir = 'asc' | 'desc';

type ModalType = 'add' | 'edit' | 'role' | 'reset' | 'delete' | null;

@Component({
  selector: 'app-utilisateurs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarAdminComponent,
    ModalUtilisateurComponent,
    ModalRoleComponent,
    ModalResetPasswordComponent,
    ModalConfirmDeleteComponent
  ],
  templateUrl: './utilisateurs.component.html',
  styleUrl: './utilisateurs.component.scss'
})
export class UtilisateursComponent {
  users: AdminUser[] = [];
  roles: AdminRole[] = [];

  filteredUsers: AdminUser[] = [];

  searchTerm = '';
  roleFilter: FilterOption = '';
  statutFilter: StatutOption = '';
  validationFilter: ValidationOption = '';

  highlightUserId: string | null = null;

  sortKey: SortKey = 'derniereConnexion';
  sortDir: SortDir = 'desc';

  modalType: ModalType = null;
  selectedUser: AdminUser | null = null;

  constructor(
    private admin: AdminService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {
    this.refresh();

    this.route.queryParams.subscribe(params => {
      const validation = params['validation'];
      if (validation === 'non-valides') {
        this.validationFilter = 'NON_VALIDÉ';
      } else if (validation === 'valides') {
        this.validationFilter = 'VALIDÉ';
      } else {
        this.validationFilter = '';
      }

      const highlight = params['highlightUserId'];
      this.highlightUserId = typeof highlight === 'string' ? highlight : null;
      this.applyFilters();
    });
  }

  private refresh() {
    forkJoin({
      users: this.admin.getUsers(),
      roles: this.admin.getRoles()
    }).subscribe({
      next: ({ users, roles }) => {
        this.users = users;
        this.roles = roles;
        this.applyFilters();
      },
      error: () => this.toast.error('Impossible de charger les utilisateurs')
    });
  }

  fullNameOf(u: AdminUser): string {
    const nom = (u.nom ?? '').trim();
    const prenom = (u.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }

  get usersCountLabel(): string {
    return `${this.filteredUsers.length} comptes enregistrés`;
  }

  resetFilters() {
    this.searchTerm = '';
    this.roleFilter = '';
    this.statutFilter = '';
    this.validationFilter = '';
    this.highlightUserId = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      queryParamsHandling: 'replace'
    });
    this.applyFilters();
  }

  applyFilters() {
    const term = this.searchTerm.trim().toLowerCase();

    let result = this.users.slice();

    if (term) {
      result = result.filter(u => {
        const full = this.fullNameOf(u).toLowerCase();
        return full.includes(term) || u.email.toLowerCase().includes(term);
      });
    }

    if (this.roleFilter) {
      result = result.filter(u => u.role === this.roleFilter);
    }

    if (this.statutFilter) {
      result = result.filter(u => u.statut === this.statutFilter);
    }

    if (this.validationFilter) {
      const wanted = this.validationFilter === 'VALIDÉ';
      result = result.filter(u => u.validated === wanted);
    }

    result = this.sortUsers(result);

    this.filteredUsers = result;
  }

  private sortUsers(input: AdminUser[]): AdminUser[] {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    const copy = input.slice();

    copy.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';

      if (this.sortKey === 'nom') {
        va = this.fullNameOf(a);
        vb = this.fullNameOf(b);
        return dir * String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
      }

      if (this.sortKey === 'role') {
        va = a.role;
        vb = b.role;
        return dir * String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
      }

      if (this.sortKey === 'statut') {
        const order: Record<AdminUserStatut, number> = { actif: 1, inactif: 0 };
        va = order[a.statut];
        vb = order[b.statut];
        return dir * (va as number) - (vb as number);
      }

      if (this.sortKey === 'derniereConnexion') {
        const ta = a.derniereConnexion ? new Date(a.derniereConnexion).getTime() : 0;
        const tb = b.derniereConnexion ? new Date(b.derniereConnexion).getTime() : 0;
        return dir * (ta - tb);
      }

      return 0;
    });

    return copy;
  }

  onSort(key: SortKey) {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'derniereConnexion' ? 'desc' : 'asc';
    }
    this.applyFilters();
  }

  sortIndicator(key: SortKey): string {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'asc' ? '▲' : '▼';
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

  initialsFromFullName(fullName: string): string {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    const res = `${a}${b}`.toUpperCase();
    return res || '??';
  }

  // Avatars: couleur unique bleue (cohérence)

  // --- Modal openers ---
  openAddModal() {
    this.selectedUser = null;
    this.modalType = 'add';
  }

  openEditModal(user: AdminUser) {
    this.selectedUser = user;
    this.modalType = 'edit';
  }

  openRoleModal(user: AdminUser) {
    this.selectedUser = user;
    this.modalType = 'role';
  }

  openResetModal(user: AdminUser) {
    this.selectedUser = user;
    this.modalType = 'reset';
  }

  openDeleteModal(user: AdminUser) {
    this.selectedUser = user;
    this.modalType = 'delete';
    this.toast.warning('Ce compte sera définitivement supprimé');
  }

  closeModal() {
    this.modalType = null;
    this.selectedUser = null;
  }

  // --- CRUD actions from modals / table ---
  onToggleStatus(userId: string) {
    this.admin.toggleUserStatus(userId).subscribe({
      next: () => {
        this.toast.success('Statut mis à jour');
        this.refresh();
      },
      error: () => this.toast.error('Erreur lors de la mise à jour du statut')
    });
  }

  onValidate(userId: string) {
    this.admin.validateAccount(userId).subscribe({
      next: () => {
        this.toast.success('Compte validé');
        this.refresh();
      },
      error: () => this.toast.error('Erreur lors de la validation')
    });
  }

  onAddUser(payload: UtilisateurFormPayload) {
    const body: AdminUserMutationPayload = {
      nom: payload.nom,
      prenom: payload.prenom,
      email: payload.email,
      role: payload.role,
      statut: payload.statut,
      validated: payload.validated,
      password: payload.password
    };
    this.admin.addUser(body).subscribe({
      next: () => {
        this.toast.success('Utilisateur créé');
        this.closeModal();
        this.refresh();
      },
      error: () => this.toast.error("Erreur lors de la création de l'utilisateur")
    });
  }

  onEditUser(payload: UtilisateurFormPayload) {
    if (!this.selectedUser) return;
    const body: AdminUserMutationPayload = {
      nom: payload.nom,
      prenom: payload.prenom,
      email: payload.email,
      role: payload.role,
      statut: payload.statut,
      validated: payload.validated,
      password: payload.password
    };
    this.admin.updateUser(this.selectedUser.id, body).subscribe({
      next: () => {
        this.toast.success('Utilisateur modifié');
        this.closeModal();
        this.refresh();
      },
      error: () => this.toast.error("Erreur lors de la mise à jour de l'utilisateur")
    });
  }

  onRoleChange(newRole: AdminUserRole) {
    if (!this.selectedUser) return;
    this.admin.assignRole(this.selectedUser.id, newRole).subscribe({
      next: () => {
        this.toast.success('Rôle modifié');
        this.closeModal();
        this.refresh();
      },
      error: () => this.toast.error('Erreur lors de la modification du rôle')
    });
  }

  // Reset password modal handles generation and logs internally
  onPasswordResetClose() {
    // Modal already wrote log + toast, but we refresh data/logs.
    this.refresh();
    this.closeModal();
  }

  onDeleteConfirmed() {
    if (!this.selectedUser) return;
    this.admin.deleteUser(this.selectedUser.id).subscribe({
      next: () => {
        this.toast.success('Compte supprimé');
        this.closeModal();
        this.refresh();
      },
      error: () => this.toast.error('Erreur lors de la suppression')
    });
  }

  // --- Helpers ---
  formatLastConnexion(iso: string): string {
    if (!iso) return 'Jamais';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Jamais';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d) + ' à ' + new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  }

  // Pagination highlight isn't required here. We just keep row highlighting.
  isHighlighted(userId: string): boolean {
    return this.highlightUserId === userId;
  }

  // Page header label counts all users
  get totalUsersCountLabel(): string {
    return `${this.users.length} comptes enregistrés`;
  }
}

