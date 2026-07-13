import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  // ── Connexion classique ──────────────────────
  email: string = '';
  motDePasse: string = '';
  erreur: string = '';
  chargement: boolean = false;
  showPassword: boolean = false;
  showForgotPasswordInfo: boolean = false;

  constructor(private router: Router, private auth: AuthService) {}

  onConnexion() {
    this.erreur = '';
    if (!this.email || !this.motDePasse) {
      this.erreur = 'Veuillez remplir tous les champs.';
      return;
    }
    this.chargement = true;
    this.auth.connexion(this.email.trim(), this.motDePasse).pipe(
      finalize(() => { this.chargement = false; })
    ).subscribe({
      next: (utilisateur) => {
        this.router.navigate([utilisateur.route]);
      },
      error: (err: Error) => {
        this.erreur = err.message;
      }
    });
  }

  togglePassword() { this.showPassword = !this.showPassword; }

  onMotDePasseOublie() {
    this.showForgotPasswordInfo = !this.showForgotPasswordInfo;
  }
}