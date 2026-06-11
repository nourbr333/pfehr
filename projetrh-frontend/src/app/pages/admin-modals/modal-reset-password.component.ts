import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AdminService, AdminUser } from '../../services/admin.service';
import { ToastService } from '../../components/toast/toast.service';

@Component({
  selector: 'app-modal-reset-password',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal-reset-password.component.html',
  styleUrl: './modal-reset-password.component.scss'
})
export class ModalResetPasswordComponent {
  @Input({ required: true }) user!: AdminUser;

  @Output() close = new EventEmitter<void>();

  generatedPassword: string | null = null;
  isGenerating = false;

  constructor(private admin: AdminService, private toast: ToastService) {}

  generate(): void {
    if (!this.user || this.isGenerating) return;
    this.isGenerating = true;

    const digits = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const pw = `Tmp@${digits}!`;
    this.generatedPassword = pw;
    this.admin.resetPassword(this.user.id, pw).subscribe({
      next: () => {
        this.toast.success('Mot de passe réinitialisé');
        this.isGenerating = false;
      },
      error: () => {
        this.toast.error('Erreur lors de la réinitialisation du mot de passe');
        this.generatedPassword = null;
        this.isGenerating = false;
      }
    });
  }

  copyToClipboard(): Promise<void> {
    if (!this.generatedPassword) return Promise.resolve();
    const text = this.generatedPassword;

    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).then(() => {
        this.toast.success('Copié !');
      });
    }

    return new Promise(resolve => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast.success('Copié !');
      resolve();
    });
  }

  onClose(): void {
    this.close.emit();
  }

  fullNameOf(): string {
    const nom = (this.user?.nom ?? '').trim();
    if (nom.includes(' ')) return nom;
    const prenom = (this.user?.prenom ?? '').trim();
    if (prenom && nom) return `${prenom} ${nom}`.trim();
    return nom || prenom || '';
  }
}

