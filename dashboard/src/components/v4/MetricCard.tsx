import type { LucideIcon } from 'lucide-react';
import { formatMetric } from './formatMetric';

export type MetricStatus = 'available' | 'partial' | 'missing' | 'stale';

const statusLabel: Record<MetricStatus, string> = {
  available: 'Disponibile',
  partial: 'Parziale',
  missing: 'Non disponibile',
  stale: 'Da aggiornare',
};

export function MetricCard({
  label, value, unit, window, source, status, detail, icon: Icon, trend, tone = 'blue',
}: {
  label: string; value: number | string | null; unit?: string; window: string; source: string;
  status: MetricStatus; detail?: string; icon: LucideIcon; trend?: number[]; tone?: 'blue' | 'violet' | 'cyan' | 'mint';
}) {
  const validNumber = typeof value !== 'number' || Number.isFinite(value);
  const visibleValue = validNumber && value !== null ? formatMetric(value) : null;
  const effectiveStatus = visibleValue === null ? 'missing' : status;

  const validTrend = trend?.length && trend.length > 1 && trend.every(Number.isFinite) ? trend : null;
  const min = validTrend ? Math.min(...validTrend) : 0;
  const span = validTrend ? Math.max(...validTrend) - min || 1 : 1;
  const points = validTrend?.map((sample, index) => `${(index / (validTrend.length - 1)) * 100},${23 - ((sample - min) / span) * 17}`).join(' ');

  return <article className={`v4-metric-card v4-metric-card--${effectiveStatus} v4-metric-card--tone-${tone}`}>
    <div className="v4-metric-card__top">
      <h2>{label}</h2>
      <Icon size={20} aria-hidden="true"/>
    </div>
    <p className="v4-metric-card__value">
      <strong>{visibleValue ?? '—'}</strong>{visibleValue !== null && unit && <span>{unit}</span>}
    </p>
    <p className="v4-metric-card__status">{statusLabel[effectiveStatus]}</p>
    <p className="v4-metric-card__meta">{window} · {source}</p>
    {detail && <p className="v4-metric-card__detail">{detail}</p>}
    {points && <svg className="v4-metric-card__trend" viewBox="0 0 100 26" role="img" aria-label={`${label}, andamento osservato negli ultimi ${validTrend!.length} giorni`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
    </svg>}
  </article>;
}
