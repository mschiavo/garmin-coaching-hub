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
  label, value, unit, window, source, status, detail, icon: Icon,
}: {
  label: string; value: number | string | null; unit?: string; window: string; source: string;
  status: MetricStatus; detail?: string; icon: LucideIcon;
}) {
  const validNumber = typeof value !== 'number' || Number.isFinite(value);
  const visibleValue = validNumber && value !== null ? formatMetric(value) : null;
  const effectiveStatus = visibleValue === null ? 'missing' : status;

  return <article className={`v4-metric-card v4-metric-card--${effectiveStatus}`}>
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
  </article>;
}
