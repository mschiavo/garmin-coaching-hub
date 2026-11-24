import { inside, median, positive, shift, validDate, windowEnding, type DailyRow, type Period } from './dates.ts';

export const metrics = [
  { key: 'hrv', label: 'HRV', unit: 'ms', zero: false },
  { key: 'resting_hr', label: 'FC a riposo', unit: 'bpm', zero: false },
  { key: 'sleep_h', label: 'Sonno', unit: 'h', zero: false },
  { key: 'stress', label: 'Stress', unit: 'punti', zero: true },
  { key: 'bb_charged', label: 'Body Battery caricata', unit: 'punti', zero: true },
  { key: 'bb_drained', label: 'Body Battery scaricata', unit: 'punti', zero: true },
] as const;
type Metric = typeof metrics[number];

export function metricDays(rows: DailyRow[], metric: Metric, end: string) {
  const values = new Map<string, number>();
  for (const row of rows) {
    const value = row[metric.key];
    if (validDate(row.date) && row.date <= end && (positive(value) || (metric.zero && value === 0))) {
      // Keep the final valid measurement in payload order for each date and metric.
      values.set(row.date, value);
    }
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export function recovery(rows: DailyRow[], period: Period) {
  return metrics.map(metric => {
    const days = metricDays(rows, metric, period.end);
    const selected = days.filter(day => inside(day.date, period));
    const latest = selected.at(-1);
    const history = latest ? days.filter(day => inside(day.date, windowEnding(shift(latest.date, -1), 28))) : [];
    const baseline = history.length >= 14 ? median(history.map(day => day.value)) : null;
    const delta = latest && baseline !== null ? latest.value - baseline : null;
    const percent = delta !== null && positive(baseline) ? 100 * (delta / baseline) : null;
    return { ...metric, latest, baseline, baselineCount: history.length, count: selected.length, delta,
      percent: Number.isFinite(percent) ? percent : null };
  });
}

export function recoveryTrend(rows: DailyRow[], metric: Metric, period: Period) {
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) return [];
  const days = new Map(metricDays(rows, metric, period.end).map(day => [day.date, day.value]));
  const trend = [];
  for (let date = period.start; date <= period.end; date = shift(date, 1)) {
    const values = Array.from({ length: 7 }, (_, i) => days.get(shift(date, -i))).filter(value => value !== undefined);
    trend.push({ date, count: values.length, value: values.length >= 4 ? median(values) : null });
  }
  return trend;
}
