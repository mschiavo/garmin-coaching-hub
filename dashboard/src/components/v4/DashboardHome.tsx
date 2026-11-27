import { CalendarDays, Clock3, Footprints, Gauge, HeartPulse, Moon, Route, ShieldCheck } from 'lucide-react';
import type { ActivityRow, DailyRow, Period } from '../../analytics/dates';
import { shift } from '../../analytics/dates';
import { color, Plot, type LoadPoint } from '../../charts';
import { DataState, type DataStateKind } from './DataState';
import { EvidenceTooltip } from './EvidenceTooltip';
import { MetricCard, type MetricStatus } from './MetricCard';
import { MultiProgressRing, type RingSeries } from './AdvancedVisualizations';

type Goal = { actual: number; target: number; unit: string; label: string; period: string };
type Props = {
  activities: ActivityRow[];
  daily: DailyRow[];
  weeklyLoad: LoadPoint[];
  period: Period;
  coverageKind: DataStateKind;
  coverageMessage: string;
  isDayCovered: (date: string) => boolean;
  updatedAt: string | null;
  source: string;
  goal?: Goal;
  demo?: boolean;
};

const valid = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const fmt = (value: number | null, digits = 1) => value == null ? '—' : value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dateText = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const activityName = (row: ActivityRow) => row.name?.trim() || ({ running: 'Corsa', trail_running: 'Trail running', cycling: 'Bici', walking: 'Camminata', strength_training: 'Forza' }[row.type ?? ''] ?? 'Attività');
const distance = (row: ActivityRow) => valid(row.distance_m) && row.distance_m > 0 ? row.distance_m / 1000 : null;
const durationText = (seconds: number | null) => seconds == null || !Number.isFinite(seconds) || seconds <= 0
  ? '—' : `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}`;

function Sparkline({ label, values, color: stroke }: { label: string; values: number[]; color: string }) {
  if (values.length < 2) return <span className="v4-sparkline-empty">Serie insufficiente</span>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${22 - ((value - min) / span) * 17}`).join(' ');
  return <svg className="v4-sparkline" viewBox="0 0 100 24" role="img" aria-label={`${label}, ${values.length} misure`} preserveAspectRatio="none">
    <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

function RecoveryRow({ label, value, unit, values, stroke, sampleCount }: {
  label: string; value: number | null; unit: string; values: number[]; stroke: string; sampleCount: number;
}) {
  return <div className="v4-recovery-row">
    <span className="v4-recovery-name">{label}</span>
    <strong>{fmt(value)} <small>{unit}</small></strong>
    <span className="v4-recovery-count">{sampleCount} {sampleCount === 1 ? 'misura' : 'misure'}</span>
    <Sparkline label={`${label}: trend`} values={values} color={stroke}/>
  </div>;
}

export function DashboardHome({ activities, daily, weeklyLoad, period, coverageKind, coverageMessage, isDayCovered, updatedAt, source, goal, demo = false }: Props) {
  const orderedActivities = [...activities].filter(row => row.date >= period.start && row.date <= period.end)
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const runs = orderedActivities.filter(row => row.type === 'running' || row.type === 'trail_running');
  const knownDistances = runs.map(distance).filter((value): value is number => value != null);
  const totalKm = knownDistances.length ? knownDistances.reduce((sum, value) => sum + value, 0) : coverageKind === 'available' ? 0 : null;
  const completeActivityCoverage = coverageKind === 'available';
  const activityStatus: MetricStatus = completeActivityCoverage ? 'available' : 'partial';
  const sessionCount = orderedActivities.length || completeActivityCoverage ? orderedActivities.length : null;
  const window = `${dateText(period.start)} – ${dateText(period.end)}`;
  const sortedDaily = [...daily].filter(row => row.date >= period.start && row.date <= period.end).sort((a, b) => a.date.localeCompare(b.date));
  const average = (values: Array<number | null | undefined>) => {
    const measurements = values.filter(valid);
    return measurements.length ? measurements.reduce((sum, value) => sum + value, 0) / measurements.length : null;
  };
  const hrv = sortedDaily.map(row => row.hrv).filter(valid);
  const sleep = sortedDaily.map(row => row.sleep_h).filter(valid);
  const restingHr = sortedDaily.map(row => row.resting_hr).filter(valid);
  const stress = sortedDaily.map(row => row.stress).filter(valid);
  const metricStatus = (count: number): MetricStatus => count === 0 ? 'missing' : count < 7 ? 'partial' : 'available';
  const validPaceRows = runs.filter(row => valid(row.distance_m) && row.distance_m > 0 && valid(row.duration_s) && row.duration_s > 0);
  const paceSeconds = validPaceRows.length
    ? validPaceRows.reduce((sum, row) => sum + row.duration_s!, 0) * 1000 / validPaceRows.reduce((sum, row) => sum + row.distance_m!, 0) : null;
  const averageRunHr = average(runs.map(row => row.average_hr));
  const longRun = knownDistances.length ? Math.max(...knownDistances) : null;
  const weekStart = shift(period.end, -6);
  const weekDays = Array.from({ length: 7 }, (_, index) => shift(weekStart, index));
  const weekCoverageComplete = weekDays.every(isDayCovered);
  const dailyMap = new Map(sortedDaily.map(row => [row.date, row]));
  const runVolumeByDate = new Map<string, number>();
  for (const row of orderedActivities) {
    if ((row.type === 'running' || row.type === 'trail_running') && distance(row) != null) {
      runVolumeByDate.set(row.date, (runVolumeByDate.get(row.date) ?? 0) + distance(row)!);
    }
  }
  const dayVolumes = weekDays.map(day => runVolumeByDate.get(day) ?? 0);
  const knownDayVolumes = weekDays.map((day, index) => isDayCovered(day) ? dayVolumes[index] : null);
  const maxDayKm = Math.max(0, ...knownDayVolumes.filter(valid));
  const hrvWeek = weekDays.map(day => dailyMap.get(day)?.hrv);
  const sleepWeek = weekDays.map(day => dailyMap.get(day)?.sleep_h);
  const bodyBattery = sortedDaily.map(row => row.bb_charged).filter(valid);
  const chartedKm = weeklyLoad.length && weeklyLoad.every(row => valid(row.km))
    ? weeklyLoad.reduce((sum, row) => sum + row.km!, 0) : null;
  const recent = orderedActivities.slice(0, 5);

  return <section className={`v4-dashboard ${demo ? 'v4-dashboard--demo' : ''}`} aria-label="Riepilogo dashboard">
    <div className="v4-dashboard-kpis v4-metric-grid">
      <MetricCard label="Distanza corsa" value={totalKm} unit="km" window={window} source={source} status={activityStatus} detail={`${knownDistances.length}/${runs.length} corse con distanza`} icon={Route} tone="blue" trend={weekCoverageComplete ? dayVolumes : undefined}/>
      <MetricCard label="Sedute registrate" value={sessionCount} unit="sedute" window={window} source={source} status={activityStatus} detail="Attività presenti nell'archivio" icon={Footprints} tone="violet" trend={weekCoverageComplete ? weekDays.map(day => orderedActivities.filter(row => row.date === day).length) : undefined}/>
      <MetricCard label="HRV media" value={average(hrv)} unit="ms" window={window} source={source} status={metricStatus(hrv.length)} detail={`${hrv.length} misure disponibili`} icon={HeartPulse} tone="cyan" trend={hrvWeek.every(valid) ? hrvWeek as number[] : undefined}/>
      <MetricCard label="Sonno medio" value={average(sleep)} unit="h" window={window} source={source} status={metricStatus(sleep.length)} detail={`${sleep.length} misure disponibili`} icon={Moon} tone="mint" trend={sleepWeek.every(valid) ? sleepWeek as number[] : undefined}/>
    </div>

    <div className="v4-dashboard-grid v4-dashboard-grid--primary">
      <section className="v4-dashboard-card v4-dashboard-volume" aria-labelledby="v4-volume-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">TRAINING LOAD · VOLUME OSSERVATO</span><h2 id="v4-volume-title">Volume di allenamento</h2><p>{chartedKm == null ? 'Distanza corsa per settimana · unità km' : `Somma dei valori mostrati: ${fmt(chartedKm)} km`} · non è TRIMP</p></div><span className="v4-source-pill">{demo ? 'DEMO' : 'ARCHIVIO'}</span></header>
        {weeklyLoad.length ? <Plot title="Volume settimanale" subtitle="Distanza per settimana, unità km" data={weeklyLoad.map(row => ({ ...row, label: row.label }))} series={[{ key: 'km', name: 'Distanza corsa (km)', color: color.blue }]} kind="bar" barMaxSize={78} height={145} meta={{ x: 'Settimana', y: 'Distanza corsa (km)', unit: 'km', zero: true }}/>
          : <DataState kind="empty">Non ci sono ancora settimane con misure valide da rappresentare.</DataState>}
        <details className="v4-volume-table"><summary>Apri tabella del volume</summary><div className="v4-table-scroll"><table><caption>Volume settimanale in chilometri</caption><thead><tr><th>Settimana</th><th>Corse</th><th>Volume</th><th>Stato</th></tr></thead><tbody>{weeklyLoad.map(row => <tr key={row.week}><td>{row.label}</td><td>{row.runs}</td><td>{fmt(row.km)} km</td><td>{row.partial ? 'Parziale' : 'Disponibile'}</td></tr>)}</tbody></table></div></details>
      </section>

      <section className="v4-dashboard-card v4-week-card" aria-labelledby="v4-week-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">ULTIMI 7 GIORNI</span><h2 id="v4-week-title">Settimana registrata</h2></div><CalendarDays size={19} aria-hidden="true"/></header>
        <div className="v4-week-summary"><div className="v4-week-summary__count"><strong>{orderedActivities.filter(row => row.date >= weekStart).length}</strong><span>sedute<br/>registrate</span></div>
          {goal ? <MultiProgressRing compact size={72} title="Progresso settimanale" series={[{ id: 'weekly-volume', label: goal.label, actual: goal.actual, target: goal.target, unit: goal.unit, color: 'var(--chart-blue)', status: demo ? 'demo' : coverageKind === 'available' ? 'available' : 'partial' } satisfies RingSeries]}/> : <DataState kind="empty" title="Target non configurato">Il progresso resta nascosto finché non esiste un obiettivo valido.</DataState>}
        </div>
        <div className="v4-week-bars" aria-label="Attività e chilometri registrati per giorno">
          {weekDays.map(day => { const km = runVolumeByDate.get(day) ?? 0; const known = isDayCovered(day); const count = orderedActivities.filter(row => row.date === day).length; return <div className={`v4-week-day ${known ? '' : 'v4-week-day--unknown'}`} key={day} title={`${dateText(day)} · ${known ? `${count} sedute · ${fmt(km)} km corsa` : 'copertura non verificata'}`}>
            <span>{new Date(`${day}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'UTC' })}</span><small className="v4-week-day__date">{day.slice(-2)}</small><i><b style={{ height: `${known && km ? Math.max(10, km / (maxDayKm || 1) * 100) : 0}%` }}/></i><span className="v4-week-day__sessions">{known ? (count ? <><Footprints size={11} aria-hidden="true"/>{count}</> : '—') : '?'}</span>
          </div>; })}
        </div>
        <p className="v4-week-footnote">Giornate verificate: {weekDays.filter(isDayCovered).length}/7 · nessun piano previsto è disponibile qui.</p>
      </section>
    </div>

    <div className="v4-dashboard-grid v4-dashboard-grid--middle">
      <section className="v4-dashboard-card v4-performance-card" aria-labelledby="v4-performance-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">ATTIVITÀ COMPLETE</span><h2 id="v4-performance-title">Performance osservata</h2><p>Descrittori derivati dai record visibili</p></div><Gauge size={19} aria-hidden="true"/></header>
        <div className="v4-performance-rows">
          <div><span><Clock3 size={16} aria-hidden="true"/> Ritmo medio delle corse</span><strong>{paceSeconds == null ? '—' : `${Math.floor(paceSeconds / 60)}:${String(Math.round(paceSeconds % 60)).padStart(2, '0')} /km`}</strong><small>{validPaceRows.length} attività con distanza e durata</small></div>
          <div><span><Route size={16} aria-hidden="true"/> Corsa più lunga</span><strong>{longRun == null ? '—' : `${fmt(longRun)} km`}</strong><small>{longRun == null ? 'Distanze non disponibili' : `${knownDistances.length} distanze valide nel periodo`}</small></div>
          <div><span><HeartPulse size={16} aria-hidden="true"/> FC media delle corse</span><strong>{averageRunHr == null ? '—' : `${fmt(averageRunHr, 0)} bpm`}</strong><small>{runs.filter(row => valid(row.average_hr)).length} attività con misura disponibile</small></div>
        </div>
      </section>

      <section className="v4-dashboard-card v4-recovery-card" aria-labelledby="v4-recovery-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">MISURE GIORNALIERE</span><h2 id="v4-recovery-title">Segnali di recupero</h2><p>Ogni indicatore mantiene il proprio campione</p></div><HeartPulse size={19} aria-hidden="true"/></header>
        <div className="v4-recovery-list">
          <RecoveryRow label="HRV" value={average(hrv)} unit="ms" values={hrv} stroke="var(--state-success)" sampleCount={hrv.length}/>
          <RecoveryRow label="Sonno" value={average(sleep)} unit="h" values={sleep} stroke="var(--accent-primary)" sampleCount={sleep.length}/>
          <RecoveryRow label="FC a riposo" value={average(restingHr)} unit="bpm" values={restingHr} stroke="var(--chart-violet)" sampleCount={restingHr.length}/>
          <RecoveryRow label="Stress" value={average(stress)} unit="indice" values={stress} stroke="var(--state-warning)" sampleCount={stress.length}/>
          {bodyBattery.length > 0 && <RecoveryRow label="Body Battery ricaricata" value={average(bodyBattery)} unit="punti" values={bodyBattery} stroke="var(--chart-cyan)" sampleCount={bodyBattery.length}/>}
        </div>
        <div className="v4-recovery-baseline" aria-label={demo ? 'Confronto demo con baseline sintetica' : 'Confronto con baseline non disponibile'}>
          <div className="v4-recovery-baseline__heading"><strong>Andamento rispetto alla baseline</strong><span>{demo ? 'CONFRONTO DEMO SINTETICO' : 'BASELINE NON DISPONIBILE'}</span></div>
          {demo ? <div className="v4-recovery-baseline__grid">{[
            { label: 'HRV', value: average(hrv), baseline: 52, unit: 'ms', better: 'higher' },
            { label: 'Sonno', value: average(sleep), baseline: 7.2, unit: 'h', better: 'higher' },
            { label: 'FC a riposo', value: average(restingHr), baseline: 51, unit: 'bpm', better: 'lower' },
            { label: 'Stress', value: average(stress), baseline: 24, unit: 'indice', better: 'lower' },
          ].map(row => {
            const delta = row.value == null ? null : row.value - row.baseline;
            const improved = delta == null ? null : row.better === 'higher' ? delta >= 0 : delta <= 0;
            return <div key={row.label} className={improved == null ? '' : improved ? 'is-positive' : 'is-caution'}><span>{row.label}</span><strong>{row.value == null ? '—' : `${fmt(row.value)} ${row.unit}`}</strong><small>{delta == null ? 'serie assente' : `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))} ${row.unit} dalla baseline demo`}</small></div>;
          })}</div> : <DataState kind="empty" title="Confronto non disponibile">La dashboard non riceve una baseline storica omogenea per questo periodo. Il confronto non viene stimato.</DataState>}
        </div>
      </section>
    </div>

    <div className="v4-dashboard-grid v4-dashboard-grid--bottom">
      <section className="v4-dashboard-card v4-recent-card" aria-labelledby="v4-recent-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">ARCHIVIO</span><h2 id="v4-recent-title">Attività recenti</h2></div><span className="v4-source-pill">{recent.length} VISIBILI</span></header>
        {recent.length ? <div className="v4-table-scroll"><table className="v4-recent-table"><caption>Attività più recenti nel periodo</caption><thead><tr><th>Data</th><th>Attività</th><th>Distanza</th><th>Durata</th><th>FC media</th></tr></thead><tbody>{recent.map(row => <tr key={String(row.id)}><td>{dateText(row.date)}</td><td>{activityName(row)}</td><td>{distance(row) == null ? '—' : `${fmt(distance(row))} km`}</td><td>{durationText(row.duration_s)}</td><td>{valid(row.average_hr) ? `${fmt(row.average_hr, 0)} bpm` : '—'}</td></tr>)}</tbody></table></div>
          : <DataState kind="empty" title="Nessuna attività nel periodo">I dati restano vuoti finché l'archivio non contiene sedute.</DataState>}
      </section>

      <section className="v4-dashboard-card v4-coverage-card" aria-labelledby="v4-coverage-title">
        <header className="v4-dashboard-card__header"><div><span className="v4-card-kicker">QUALITÀ DELL'ARCHIVIO</span><h2 id="v4-coverage-title">Copertura dei dati</h2></div><ShieldCheck size={19} aria-hidden="true"/></header>
        <DataState kind={coverageKind} title={coverageKind === 'available' ? 'Periodo verificato' : coverageKind === 'partial' ? 'Periodo parziale' : 'Stato del periodo'}>{coverageMessage}</DataState>
        <div className="v4-coverage-meta"><span>Fonte</span><strong>{source}</strong><span>Ultimo aggiornamento</span><strong>{updatedAt ? new Date(updatedAt).toLocaleString('it-IT') : 'Non disponibile'}</strong><span>Finestra</span><strong>{window}</strong></div>
        <EvidenceTooltip source={source} method="Conteggi e stato di copertura dell'archivio" period={window} samples={`${orderedActivities.length} attività · ${sortedDaily.length} misure giornaliere`} limits="Una misura assente non viene convertita in zero."/>
      </section>
    </div>
  </section>;
}
