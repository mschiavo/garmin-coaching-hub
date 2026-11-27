import { formatMetric } from './formatMetric';

export function ProgressRing({ actual, target, unit, period, label, status = 'available' }: {
  actual: number | null; target: number | null; unit: string; period: string; label: string;
  status?: 'available' | 'partial' | 'missing';
}) {
  const valid = actual !== null && Number.isFinite(actual) && actual >= 0 &&
    target !== null && Number.isFinite(target) && target > 0 && unit.trim().length > 0;

  if (!valid || status === 'missing') {
    return <section className="v4-progress-card" aria-label={`${label}: progresso non disponibile`}>
      <h2>{label}</h2>
      <p className="v4-progress-unavailable">Progresso non disponibile</p>
      <p>{target !== null && target <= 0 ? 'Il target deve essere maggiore di zero.' : 'Servono valori validi e un target con unità definita.'}</p>
      <small>{period} · {status === 'partial' ? 'Dati parziali' : 'Dati mancanti'}</small>
    </section>;
  }

  const percentage = actual! / target! * 100;
  const visualPercentage = Math.min(percentage, 100);
  const circumference = 2 * Math.PI * 43;
  const progressLength = circumference * visualPercentage / 100;
  const gapLength = circumference - progressLength;
  const exceededBy = Math.max(0, actual! - target!);

  return <section className={`v4-progress-card v4-progress-card--${status}`}>
    <h2>{label}</h2>
    <div className="v4-progress-ring-wrap">
      <svg className="v4-progress-ring" viewBox="0 0 100 100" role="img"
        aria-label={`${label}: ${formatMetric(actual!)} su ${formatMetric(target!)} ${unit}, ${formatMetric(percentage)} percento${status === 'partial' ? ', dati parziali' : ''}`}>
        <circle className="v4-progress-ring__track" cx="50" cy="50" r="43"/>
        <circle className="v4-progress-ring__value" cx="50" cy="50" r="43"
          strokeDasharray={`${progressLength} ${gapLength}`} transform="rotate(-90 50 50)"/>
      </svg>
      <div className="v4-progress-ring__center" aria-hidden="true">
        <strong>{formatMetric(percentage)}%</strong>
        <span>{status === 'partial' ? 'Parziale' : 'del target'}</span>
      </div>
    </div>
    <p className="v4-progress-values"><strong>{formatMetric(actual!)} {unit}</strong> su {formatMetric(target!)} {unit}</p>
    {exceededBy > 0 && <p className="v4-progress-excess">Superamento: +{formatMetric(exceededBy)} {unit}</p>}
    <small>{period}{status === 'partial' ? ' · Dati parziali' : ''}</small>
  </section>;
}
