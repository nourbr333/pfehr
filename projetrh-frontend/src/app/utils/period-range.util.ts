export type DashboardPeriod = 'month' | 'quarter' | 'year';

export interface DateRange {
  start: Date;
  end: Date;
}

export function getCurrentRange(period: DashboardPeriod, now = new Date()): DateRange {
  if (period === 'year') {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    };
  }
  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    return {
      start: new Date(now.getFullYear(), quarter * 3, 1),
      end: new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999)
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  };
}

export function getPreviousRange(period: DashboardPeriod, now = new Date()): DateRange {
  if (period === 'year') {
    const prevYear = now.getFullYear() - 1;
    return {
      start: new Date(prevYear, 0, 1),
      end: new Date(prevYear, 11, 31, 23, 59, 59, 999)
    };
  }
  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    const prevQuarter = quarter === 0 ? 3 : quarter - 1;
    const prevYear = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: new Date(prevYear, prevQuarter * 3, 1),
      end: new Date(prevYear, prevQuarter * 3 + 3, 0, 23, 59, 59, 999)
    };
  }
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return {
    start: new Date(prevYear, prevMonth, 1),
    end: new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999)
  };
}

export function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day);
}

export function isDateInRange(ymd: string, range: DateRange): boolean {
  if (!ymd) return false;
  const date = parseYmd(ymd);
  return date >= range.start && date <= range.end;
}

export function formatRangeLabel(range: DateRange): string {
  const fmt = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}
