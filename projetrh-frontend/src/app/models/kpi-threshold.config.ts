export type KpiKey = 'attendance' | 'absenteisme' | 'retard';

export interface KpiThresholdDefinition {
  key: KpiKey;
  label: string;
  formula: string;
  suggestedTarget: string;
  unit: 'percent';
  higherIsBetter: boolean;
  thresholdHelp: string;
  targetHelp: string;
}

export const KPI_THRESHOLD_DEFINITIONS: Record<KpiKey, KpiThresholdDefinition> = {
  attendance: {
    key: 'attendance',
    label: 'Taux de présence moyen',
    formula: 'Σ(Taux de présence individuels) ÷ Effectif',
    suggestedTarget: '≥ 90 %',
    unit: 'percent',
    higherIsBetter: true,
    thresholdHelp: 'Vous serez alerté si le taux descend en dessous de ce seuil.',
    targetHelp: 'Notification de succès quand l\'objectif est atteint (doit être supérieur au seuil d\'alerte).'
  },
  absenteisme: {
    key: 'absenteisme',
    label: "Taux d'absentéisme moyen",
    formula: '100 % − Taux de présence moyen',
    suggestedTarget: '≤ 10 %',
    unit: 'percent',
    higherIsBetter: false,
    thresholdHelp: 'Vous serez alerté si le taux dépasse ce seuil.',
    targetHelp: 'Notification de succès quand l\'objectif est atteint (doit être inférieur au seuil d\'alerte).'
  },
  retard: {
    key: 'retard',
    label: 'Taux de retard moyen',
    formula: 'Σ(Jours retard) ÷ Σ(Jours ouvrables) × 100',
    suggestedTarget: '≤ 5 %',
    unit: 'percent',
    higherIsBetter: false,
    thresholdHelp: 'Vous serez alerté si le taux dépasse ce seuil.',
    targetHelp: 'Notification de succès quand l\'objectif est atteint (doit être inférieur au seuil d\'alerte).'
  }
};

export const KPI_THRESHOLD_KEYS = Object.keys(KPI_THRESHOLD_DEFINITIONS) as KpiKey[];

export function isKpiKey(value: string): value is KpiKey {
  return KPI_THRESHOLD_KEYS.includes(value as KpiKey);
}

export function getKpiDefinition(key: string): KpiThresholdDefinition | null {
  return isKpiKey(key) ? KPI_THRESHOLD_DEFINITIONS[key] : null;
}

export function isThresholdBreached(
  key: KpiKey,
  value: number,
  thresholdValue: number | null | undefined
): boolean {
  if (thresholdValue == null) return false;
  const def = KPI_THRESHOLD_DEFINITIONS[key];
  return def.higherIsBetter ? value < thresholdValue : value > thresholdValue;
}

export function isTargetAchieved(
  key: KpiKey,
  value: number,
  targetValue: number | null | undefined
): boolean {
  if (targetValue == null) return false;
  const def = KPI_THRESHOLD_DEFINITIONS[key];
  return def.higherIsBetter ? value >= targetValue : value <= targetValue;
}

export function validateThresholdTarget(
  key: KpiKey,
  threshold: number | null,
  target: number | null
): string | null {
  if (threshold != null && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
    return "Le seuil d'alerte doit être compris entre 0 et 100.";
  }
  if (target != null && (!Number.isFinite(target) || target < 0 || target > 100)) {
    return "L'objectif cible doit être compris entre 0 et 100.";
  }
  if (threshold == null || target == null) return null;
  const def = KPI_THRESHOLD_DEFINITIONS[key];
  if (def.higherIsBetter && target <= threshold) {
    return "L'objectif cible doit être supérieur au seuil d'alerte.";
  }
  if (!def.higherIsBetter && target >= threshold) {
    return "L'objectif cible doit être inférieur au seuil d'alerte.";
  }
  return null;
}

export function formatPeriodLabel(yearMonth: string): string {
  if (!yearMonth) return '';
  const [year, month] = yearMonth.split('-');
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return `${months[(parseInt(month, 10) - 1)] ?? ''} ${year}`;
}

export function buildThresholdPhrase(
  userName: string,
  kpiLabel: string,
  period: string,
  seuil: number | null,
  cible: number | null
): string {
  if (seuil == null && cible == null) return '';
  const parts: string[] = [];
  if (seuil != null) parts.push(`un seuil d'alerte de ${seuil} %`);
  if (cible != null) parts.push(`un objectif cible de ${cible} %`);
  const periodLabel = period ? formatPeriodLabel(period) : 'la période en cours';
  return `${userName} a fixé pour ${periodLabel} ${parts.join(' et ')} pour la mesure ${kpiLabel}.`;
}
