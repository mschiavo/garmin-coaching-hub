export type ActivityRow = { id: number; date: string; type: string; name: string; distance_m: number | null; duration_s: number | null; average_hr: number | null };
export type DailyRow = { date: string; sleep_h: number | null; hrv: number | null; resting_hr: number | null; stress: number | null; bb_charged: number | null; bb_drained: number | null; steps: number | null };
export type Period = { start: string; end: string };

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function shift(date: string, days: number): string {
  const utc = new Date(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export const monday = (date: string) => shift(date, -((new Date(date).getUTCDay() + 6) % 7));
export const inside = (date: string, { start, end }: Period) => date >= start && date <= end;
export const windowEnding = (end: string, length: number): Period => ({ start: shift(end, 1 - length), end });
export const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;
export const isRun = (activity: ActivityRow) => activity.type === 'running' || activity.type === 'trail_running';

export function weeks(period: Period): string[] {
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) return [];
  const result: string[] = [];
  for (let date = monday(period.start); date <= period.end; date = shift(date, 7)) result.push(date);
  return result;
}

export function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return null;
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

export function horizon(activities: ActivityRow[], daily: DailyRow[], today: string): Period | null {
  const dates = [...activities, ...daily].map(row => row.date).filter(date => validDate(date) && date <= today).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

export function lastCompleteWeek(reference: string, today: string): string {
  const week = monday(reference);
  return shift(week, 6) === reference && reference < today ? week : shift(week, -7);
}
