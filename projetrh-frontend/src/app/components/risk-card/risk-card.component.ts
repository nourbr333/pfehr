import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PredictionResult, RiskLevel } from '../../services/prediction.service';

/**
 * Carte de risque IA réutilisable (Absentéisme / Burnout / OKR).
 * Deux modes : `compact` (cellule de tableau) et complet (détail).
 */
@Component({
  selector: 'app-risk-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container [ngSwitch]="state">
      <span *ngSwitchCase="'loading'" class="risk-loading">…</span>
      <span *ngSwitchCase="'error'" class="risk-error" title="Prédiction indisponible">N/A</span>

      <div *ngSwitchCase="'ready'" class="risk-card" [class.compact]="compact" [class]="levelClass">
        <div class="risk-bar-wrap" *ngIf="result as r">
          <div class="risk-bar">
            <div class="risk-fill" [style.width.%]="r.riskProba * 100"></div>
          </div>
          <div class="risk-meta">
            <span class="risk-pct">{{ r.riskProba * 100 | number: '1.0-0' }}%</span>
            <span class="risk-badge">{{ levelLabel }}</span>
          </div>
        </div>

        <div class="risk-factors" *ngIf="!compact && result?.topFeatures?.length">
          <div class="risk-factors-title">Facteurs contributifs</div>
          <div class="factor" *ngFor="let f of topFactors">
            <span class="factor-name">{{ prettyFeature(f.name) }}</span>
            <div class="factor-bar">
              <div class="factor-fill" [style.width.%]="f.importance * 100 / maxImportance"></div>
            </div>
            <span class="factor-val">{{ f.importance * 100 | number: '1.0-0' }}%</span>
          </div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: inline-block; width: 100%; }
    .risk-loading, .risk-error { font-size: 13px; color: #9ca3af; }
    .risk-error { color: #b45309; }

    .risk-card { width: 100%; }
    .risk-bar-wrap { display: flex; align-items: center; gap: 8px; }
    .risk-bar {
      flex: 1; height: 8px; border-radius: 999px; background: #eef2f7; overflow: hidden;
      min-width: 70px;
    }
    .risk-fill { height: 100%; border-radius: 999px; transition: width .3s ease; }
    .risk-meta { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
    .risk-pct { font-weight: 700; font-size: 13px; }
    .risk-badge {
      font-size: 10px; font-weight: 700; letter-spacing: .3px;
      padding: 2px 7px; border-radius: 999px; text-transform: uppercase;
    }

    .low    .risk-fill { background: #22c55e; }
    .medium .risk-fill { background: #f59e0b; }
    .high   .risk-fill { background: #ef4444; }
    .low    .risk-badge { background: #dcfce7; color: #166534; }
    .medium .risk-badge { background: #fef3c7; color: #92400e; }
    .high   .risk-badge { background: #fee2e2; color: #991b1b; }
    .low    .risk-pct { color: #166534; }
    .medium .risk-pct { color: #92400e; }
    .high   .risk-pct { color: #991b1b; }

    .risk-factors { margin-top: 14px; }
    .risk-factors-title {
      font-size: 11px; text-transform: uppercase; letter-spacing: .4px;
      color: #6b7280; margin-bottom: 8px; font-weight: 700;
    }
    .factor { display: grid; grid-template-columns: 150px 1fr 40px; align-items: center; gap: 8px; margin-bottom: 6px; }
    .factor-name { font-size: 12px; color: #374151; }
    .factor-bar { height: 6px; background: #eef2f7; border-radius: 999px; overflow: hidden; }
    .factor-fill { height: 100%; background: #6366f1; border-radius: 999px; }
    .factor-val { font-size: 12px; color: #6b7280; text-align: right; }
  `]
})
export class RiskCardComponent {
  @Input() result: PredictionResult | null = null;
  @Input() loading = false;
  @Input() error = false;
  @Input() compact = false;

  get state(): 'loading' | 'error' | 'ready' {
    if (this.loading) return 'loading';
    if (this.error || !this.result) return 'error';
    return 'ready';
  }

  get levelClass(): string {
    return (this.result?.riskLevel ?? 'LOW').toLowerCase();
  }

  get levelLabel(): string {
    const map: Record<RiskLevel, string> = { LOW: 'Faible', MEDIUM: 'Moyen', HIGH: 'Élevé' };
    return map[this.result?.riskLevel ?? 'LOW'];
  }

  get topFactors(): { name: string; importance: number }[] {
    return (this.result?.topFeatures ?? []).filter((f) => f.importance > 0).slice(0, 5);
  }

  get maxImportance(): number {
    const vals = this.topFactors.map((f) => f.importance);
    return vals.length ? Math.max(...vals) : 1;
  }

  prettyFeature(name: string): string {
    const labels: Record<string, string> = {
      taux_absence_30j: 'Taux absence 30j',
      taux_absence_90j: 'Taux absence 90j',
      nb_retards_30j: 'Retards 30j',
      overtime_moyen_30j: 'Heures supp. moy.',
      nb_maladie_12m: 'Arrêts maladie 12m',
      nb_approuves_12m: 'Congés approuvés 12m',
      nb_refus_12m: 'Congés refusés 12m',
      dept_taux_absence: 'Absence département',
      anciennete: 'Ancienneté',
      age: 'Âge'
    };
    return labels[name] ?? name;
  }
}
