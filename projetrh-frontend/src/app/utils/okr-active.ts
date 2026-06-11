/** Objectif encore en cours pour les analyses OKR (échéance non dépassée, non terminé). */
export function isActiveOkrForAnalysis(
  dueDate: string | null | undefined,
  progressPercent: number,
  today = new Date()
): boolean {
  if (progressPercent >= 100) return false;
  if (!dueDate) return true;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = new Date(dueDate.slice(0, 10));
  return due.getTime() >= todayStart.getTime();
}
