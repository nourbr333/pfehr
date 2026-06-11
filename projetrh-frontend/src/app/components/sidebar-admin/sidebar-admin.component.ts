import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, Utilisateur } from '../../services/auth';
import { ToastComponent } from '../toast/toast.component';
import { NotificationsPanelComponent } from '../notifications-panel/notifications-panel';

@Component({
  selector: 'app-sidebar-admin',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ToastComponent, NotificationsPanelComponent],
  templateUrl: './sidebar-admin.component.html',
  styleUrl: './sidebar-admin.component.scss'
})
export class SidebarAdminComponent {
  utilisateur: Utilisateur | null = null;
  roleLabel = '';

  constructor(private router: Router, private auth: AuthService) {
    // Requirement: lecture via localStorage('currentUser')
    this.utilisateur = this.getCurrentUserFromLocalStorage();
    this.roleLabel = this.roleDisplay(this.utilisateur?.role ?? '');
  }

  private getCurrentUserFromLocalStorage(): Utilisateur | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem('currentUser');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Utilisateur;
      return parsed;
    } catch {
      return this.auth.utilisateur ?? null;
    }
  }

  get avatarText(): string {
    return this.buildAvatarText(
      this.utilisateur?.initiales,
      this.utilisateur?.prenom,
      this.utilisateur?.nom
    );
  }

  onNotifications() {}

  onDeconnexion() {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil() {
    this.router.navigate(['/profil']);
  }

  private roleDisplay(raw: string): string {
    if (raw === 'ADMIN') return 'Admin';
    if (raw.toLowerCase().includes('manager')) return 'Manager';
    if (raw.toLowerCase().includes('responsable')) return 'Responsable RH';
    if (raw.toLowerCase().includes('administrateur')) return 'Responsable RH';
    return raw;
  }

  private buildAvatarText(initiales?: string, prenom?: string, nom?: string): string {
    const cleaned = (initiales ?? '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2);
    }

    const a = (prenom?.trim().charAt(0) ?? '').toUpperCase();
    const b = (nom?.trim().charAt(0) ?? '').toUpperCase();
    const fallback = `${a}${b}`.replace(/[^A-Z]/g, '');
    return fallback || 'NA';
  }
}

