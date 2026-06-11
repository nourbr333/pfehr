import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { AuthService } from '../../services/auth';
import { KpiThresholdService, KpiThresholdSaveRequest } from '../../services/kpi-threshold.service';
import { NotesRespService } from '../../services/notes-resp.service';
import { ToastService } from '../toast/toast.service';
import {
  KpiKey,
  buildThresholdPhrase,
  getKpiDefinition,
  validateThresholdTarget
} from '../../models/kpi-threshold.config';

@Component({
  selector: 'app-kpi-threshold-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kpi-threshold-modal.component.html',
  styleUrl: './kpi-threshold-modal.component.scss'
})
export class KpiThresholdModalComponent implements OnChanges {
  private readonly kpiThresholdService = inject(KpiThresholdService);
  private readonly notesService = inject(NotesRespService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  @Input() open = false;
  @Input({ required: true }) kpiKey!: KpiKey;
  @Input({ required: true }) kpiLabel = '';
  @Input() currentValue = 0;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  period = '';
  seuil: number | null = null;
  cible: number | null = null;
  comment = '';
  validationError = '';

  get definition() {
    return getKpiDefinition(this.kpiKey);
  }

  get existingThreshold() {
    return this.kpiThresholdService.getThreshold(this.kpiKey);
  }

  get todayDateStr(): string {
    return new Date().toLocaleDateString('fr-FR');
  }

  get userName(): string {
    const u = this.authService.utilisateur;
    const name = `${u?.prenom ?? ''} ${u?.nom ?? ''}`.trim();
    return name || 'Le responsable';
  }

  get phrasePreview(): string {
    return buildThresholdPhrase(this.userName, this.kpiLabel, this.period, this.seuil, this.cible);
  }

  ngOnChanges(): void {
    if (this.open) {
      this.resetForm();
    }
  }

  private resetForm(): void {
    const existing = this.existingThreshold;
    this.period = '';
    this.seuil = existing?.thresholdValue != null ? Number(existing.thresholdValue) : null;
    this.cible = existing?.targetValue != null ? Number(existing.targetValue) : null;
    this.comment = '';
    this.validationError = '';
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    const userId = this.authService.utilisateur?.userId;
    const email = this.authService.utilisateur?.email ?? '';
    if (userId == null) {
      this.toastService.error('Utilisateur non identifié.');
      return;
    }

    this.validationError = validateThresholdTarget(this.kpiKey, this.seuil, this.cible) ?? '';
    if (this.validationError) return;

    const periodLabel = this.period
      ? this.formatPeriodLabel(this.period)
      : '';

    const req: KpiThresholdSaveRequest = {
      userId,
      kpiKey: this.kpiKey,
      kpiLabel: this.kpiLabel,
      periodLabel,
      thresholdValue: this.seuil,
      targetValue: this.cible,
      phraseOfficielle: this.phrasePreview
    };

    this.kpiThresholdService.save(req).subscribe({
      next: () => {
        if (this.comment.trim() && email) {
          this.notesService.add({
            userEmail: email,
            kpiKey: this.kpiKey,
            kpiLabel: this.kpiLabel,
            kpiValue: this.round1(this.currentValue) + '%',
            content: this.comment.trim()
          }).subscribe();
        }
        this.toastService.success('Seuils enregistrés avec succès.');
        this.saved.emit();
        this.close();
      },
      error: () => this.toastService.error("Impossible d'enregistrer les seuils.")
    });
  }

  deleteThreshold(): void {
    const existing = this.existingThreshold;
    if (!existing) return;
    this.kpiThresholdService.delete(existing.id).subscribe({
      next: () => {
        this.toastService.success('Seuils supprimés.');
        this.saved.emit();
        this.close();
      },
      error: () => this.toastService.error('Impossible de supprimer les seuils.')
    });
  }

  private formatPeriodLabel(yearMonth: string): string {
    const [year, month] = yearMonth.split('-');
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return `${months[(parseInt(month, 10) - 1)] ?? ''} ${year}`;
  }

  private round1(n: number): string {
    return (Math.round(n * 10) / 10).toFixed(1);
  }
}
