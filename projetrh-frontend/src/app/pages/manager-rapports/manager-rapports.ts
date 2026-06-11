import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, Utilisateur } from '../../services/auth';
import { RapportComponent } from './rapport.component';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

@Component({
  selector: 'app-manager-rapports',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RapportComponent, NotificationsPanelComponent],
  templateUrl: './manager-rapports.html',
  styleUrl: './manager-rapports.scss'
})
export class ManagerRapportsComponent {
  utilisateur: Utilisateur | null;

  constructor(private router: Router, private auth: AuthService) {
    this.utilisateur = this.auth.getCurrentUser();
    if (!this.utilisateur) this.router.navigate(['/login']);
  }

  onNotifications() {}

  onDeconnexion() {
    this.auth.deconnexion();
    this.router.navigate(['/login']);
  }

  onProfil() { this.router.navigate(['/profil']); }
}

