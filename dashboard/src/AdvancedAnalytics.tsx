import { useEffect, useMemo, useState } from 'react';
import { Plot, color } from './charts';
import { extendedFields, horizon, inside, lastCompleteWeek, shift, weeks, type ActivityRow, type DailyRow, type Period } from './analytics/dates';
import { cohortKey, distanceLabels, efficiency, efficiencyChange, weeklyEfficiency, type Cohort } from './analytics/efficiency';
import { bestActivities, projectRace, raceDistances } from './analytics/performance';
import type { Covered } from './analytics/coverage';
import { recovery, recoveryTrend } from './analytics/recovery';
import { advancedLoad, coverageNote, loadDistribution, loadTotals } from './analytics/load';
import { format, reportMarkdown, weeklyReport } from './analytics/weeklyReport';

const views = ['Efficienza', 'Prestazioni', 'Recupero', 'Carico avanzato', 'Report settimanale'] as const;
type View = typeof views[number];
const cohortName = (cohort: Cohort) => `${cohort.type === 'running' ? 'Running' : 'Trail running'} · ${distanceLabels[cohort.distance]} · ${cohort.heart}–${cohort.heart + 9} bpm`;
const dateMeta = (y: string, unit: string) => ({ x: 'Data', y, unit });
const chart = (title: string, data: Record<string, unknown>[], key: string, unit: string, subtitle?: string, kind: 'line' | 'bar' | 'scatter' = 'line') =>
  <Plot title={title} subtitle={subtitle} data={data} series={[{ key, name: unit, color: color.cyan }]} kind={kind}
    meta={kind === 'scatter' ? { x: 'Ritmo (s/km)', y: 'FC (bpm)', unit } : kind === 'bar' ? { x: 'Fascia', y: 'Corse (n.)', unit, zero: true } : dateMeta(unit, unit)} />;

const duration = (seconds: number) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 3600)} h ${Math.floor(rounded % 3600 / 60)} min ${rounded % 60} s`;
};

function Totals({ label, totals }: { label: string; totals: ReturnType<typeof loadTotals> }) {
  return <li><strong>{label}</strong>{!totals.distanceComplete || !totals.durationComplete ? ' · somma registrata parziale' : ''} · {format(totals.km)} km ({totals.distanceCount}/{totals.runs}) · {format(totals.hours)} h ({totals.durationCount}/{totals.runs}) · {totals.runs} corse · {totals.active} giorni attivi</li>;
}

function downloadReport(week: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `garmin-report-${week}.md`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdvancedAnalytics({ activities, daily, range, today, requested, covered }:  {
  activities: ActivityRow[]; daily: DailyRow[]; range: string; today: string; requested: Period | null; covered: Covered;
}) {
  const observed = useMemo(() => horizon(activities, daily, today), [activities, daily, today]);
  const candidates = useMemo(() => efficiency(activities).filter(run => run.cohort.distance > 0 && run.row.date <= today), [activities, today]);
  const [view, setView] = useState<View>('Efficienza');
  const [type, setType] = useState('running');
  const [distance, setDistance] = useState('');
  const [heart, setHeart] = useState('');
  const [race, setRace] = useState('');
  const [confirmation, setConfirmed] = useState<string | null>(null);
  useEffect(() => setConfirmed(null), [activities, requested, range]);
  const [week, setWeek] = useState('');
  const [metricKey, setMetricKey] = useState('hrv');

  return <section className="advanced-analytics" aria-label="Advanced Analytics">
    <div className="advanced-controls">
      <label>Modulo <select value={view} onChange={event => setView(event.target.value as View)}>
        {views.map(name => <option key={name}>{name}</option>)}
      </select></label>
    </div>
    {observed || requested ? renderModule((observed ?? requested)!) : <p className="panel empty">Nessun dato disponibile per Advanced Analytics.</p>}
  </section>;

  function renderModule(archive: Period) {
    const period = requested ?? { start: range === 'all' ? archive.start : shift(archive.end, 1 - Number(range)), end: archive.end };
    const lastWeek = lastCompleteWeek(period.end, today);
    const selected = activities.filter(row => inside(row.date, period));
    const typeCandidates = candidates.filter(run => run.cohort.type === type && inside(run.row.date, period));
    const distances = [...new Set(typeCandidates.map(run => run.cohort.distance))].sort((a, b) => a - b);
    const selectedDistance = distances.includes(Number(distance)) ? Number(distance) : distances[0];
    const hearts = [...new Set(typeCandidates.filter(run => run.cohort.distance === selectedDistance).map(run => run.cohort.heart))].sort((a, b) => a - b);
    const selectedHeart = heart && hearts.includes(Number(heart)) ? Number(heart) : hearts[0];
    const cohort = hearts.length ? { type, distance: selectedDistance, heart: selectedHeart } : null;
    const selectedKey = cohort ? cohortKey(cohort) : '';
    const cohortLabel = cohort ? cohortName(cohort) : 'Nessuna coorte disponibile';
    const runs = candidates.filter(run => cohortKey(run.cohort) === selectedKey);
    const weekly = view === "Efficienza" || view === "Prestazioni" ? weeklyEfficiency(runs, period) : [];

    const filters = <div className="advanced-controls">
      <label>Tipo di corsa <select value={type} onChange={event => { setType(event.target.value); setDistance(''); setHeart(''); }}>
        <option value="running">Running</option><option value="trail_running">Trail running</option>
      </select></label>
      <label>Fascia di distanza <select value={selectedDistance ?? ''} disabled={!distances.length} onChange={event => { setDistance(event.target.value); setHeart(''); }}>
        {!distances.length && <option value="">Indisponibile</option>}
        {distances.map(band => <option key={band} value={band}>{distanceLabels[band]}</option>)}
      </select></label>
      <label>Fascia FC media <select value={selectedHeart ?? ''} disabled={!hearts.length} onChange={event => setHeart(event.target.value)}>
        {!hearts.length && <option value="">Indisponibile</option>}
        {hearts.map(band => <option key={band} value={band}>{band}–{band + 9} bpm</option>)}
      </select></label>
    </div>;

    function weeklyChart(key: 'index' | 'hr' | 'pace', title: string, unit: string) {
      return chart(title, weekly.some(row => row.count) ? weekly.map(row => ({ ...row, label: row.date })) : [], key, unit,
        'Mediana per settimana · le date senza misure mantengono una lacuna');
    }

    const sample = weekly.filter(row => row.count).map(row => <li key={row.date}>{row.date} · {row.count} corse valide</li>);
    const counts = <details><summary>Numerosità settimanali</summary>{sample.length ? <ul>{sample}</ul> : <p>Nessuna corsa valida nella coorte.</p>}</details>;
    const context = <p className="advanced-context">Periodo {period.start} – {period.end} · Orizzonte osservato {archive.start} – {archive.end}. {archive.end === today ? 'Giorno corrente parziale. ' : ''}{coverageNote}</p>;
    let content;

    if (view === 'Efficienza') {
      const change = efficiencyChange(runs, lastWeek);
      const recentWindow = { start: shift(lastWeek, -21), end: shift(lastWeek, 6) };
      const previousWindow = { start: shift(lastWeek, -49), end: shift(lastWeek, -22) };
      const recentCovered = covered(recentWindow);
      const previousCovered = covered(previousWindow);
      const valid = new Set<ActivityRow>(efficiency(activities).map(run => run.row));
      const completeMeasures = activities.every(row => row.type !== type ||
        (!inside(row.date, recentWindow) && !inside(row.date, previousWindow)) || valid.has(row));
      const points = runs.filter(run => inside(run.row.date, period)).map(run => ({ label: run.row.date, pace: run.pace, hr: run.hr }));
      content = <>{filters}<p>{points.length} {points.length === 1 ? 'corsa valida' : 'corse valide'}. La durata usata proviene dal riepilogo Garmin. L’indice divide velocità registrata (km/h) per FC media (bpm). Terreno, meteo, dislivello e pause possono influire sul confronto.</p>
        <p>Quattro settimane concluse al {shift(lastWeek, 6)}: {change.recent} corse valide · quattro precedenti: {change.previous}.
          {!recentCovered || !previousCovered ? ' Confronto omesso per copertura insufficiente.' :
            !completeMeasures ? ' Confronto omesso per misure mancanti o anomale.' :
            change.change === null ? ' Confronto indisponibile. Servono almeno 3 corse valide in ciascuna finestra della stessa coorte.' :
            ` Variazione della mediana ${format(change.change)}%.`}</p>
        <p>Copertura attività delle finestre · recente {recentCovered ? 'verificata' : 'insufficiente'} · precedente {previousCovered ? 'verificata' : 'insufficiente'}.</p>
        <div className="charts">{chart('Ritmo e FC media', points, 'hr', 'bpm', 'Un punto per attività', 'scatter')}{weeklyChart('index', 'Efficienza settimanale', 'km/h per bpm')}</div>{counts}</>;
    } else if (view === 'Prestazioni') {
      const entries = selected.filter(row => row.type === type && projectRace(row, (row.distance_m ?? 0) / 1000) !== null).sort((a, b) => b.date.localeCompare(a.date));
      const reference = entries.find(row => String(row.id) === race);
      const signature = reference ? JSON.stringify([reference.id,reference.date,reference.distance_m,reference.duration_s,reference.type]) : null;
      const confirmed = signature !== null && confirmation === signature;
      const best = bestActivities(selected.filter(row => row.type === type));
      content = <>{filters}<div className="panel advanced-panel"><h3>Migliori attività registrate</h3>
        <ul>{([
          ['Distanza maggiore', best.longest, (v: number) => `${format(v / 1000)} km`],
          ['Durata maggiore', best.duration, duration],
          ['Ritmo più veloce', best.fastest, (v: number) => `${format(v, 1)} s/km`],
        ] as const).map(([label, result, value]) => <li key={label}>{label} · {result ? `${value(result.value)} · ${result.row.date} · ${result.row.type}` : 'Indisponibile'}</li>)}</ul>
        <h3>Proiezioni Riegel</h3>
        <div className="advanced-controls"><label>Attività di riferimento <select value={reference ? race : ''} onChange={event => { setRace(event.target.value); setConfirmed(null); }}>
          <option value="">Scegli una prestazione</option>
          {entries.map(row => <option key={row.id} value={row.id}>{row.date} · {format((row.distance_m ?? 0) / 1000)} km · {duration(row.duration_s ?? 0)} · {row.name}</option>)}
        </select></label></div>
        {reference && <label className="advanced-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked ? signature : null)} /> Confermo che questa attività è una prestazione di riferimento rappresentativa.</label>}
        <p>Preferisci una gara o prova massimale su strada. T₂ = T₁ × (D₂ / D₁)^1,06. Il modello offre tempi indicativi. La prestazione individuale può variare.</p>
        {!reference || !confirmed ? <p>Seleziona e conferma una prestazione per calcolare le proiezioni.</p>
          : <ul>{raceDistances.map(target => {
            const time = projectRace(reference, target);
            return <li key={target}>{format(target, 4)} km · {time === null ? 'Indisponibile: rapporto distanze oltre 2,5×' : duration(time)}</li>;
          })}</ul>}
      </div><div className="charts">{weeklyChart('pace', 'Ritmo settimanale', 's/km')}{weeklyChart('hr', 'FC media settimanale', 'bpm')}</div>{counts}
      <div className="charts">{extendedFields.slice(0, 6).map(([key, label, unit]) => {
        const points = selected.filter(row => row.type === type && typeof row[key] === 'number')
          .map(row => ({ label: row.date, value: row[key] }));
        return points.length ? <div key={key}>{chart(label, points, 'value', unit, `${points.length} attività con misura valida`)}</div> : null;
      })}</div></>;
    } else if (view === 'Recupero') {
      const items = recovery(daily, period);
      const metric = items.find(item => item.key === metricKey) ?? items[0];
      const trend = recoveryTrend(daily, metric, { ...period, start: period.start < archive.start ? archive.start : period.start });
      const last = trend.at(-1);
      content = <><div className="charts">{items.map(item => <section className="panel advanced-panel" key={item.key}>
        <h3>{item.label}</h3>
        {item.latest ? <><p><strong>{format(item.latest.value)} {item.unit}</strong> · {item.latest.date}{item.latest.date < shift(period.end, -6) ? ' · misura precedente agli ultimi 7 giorni' : ''} · {item.count} giorni validi nel periodo</p>
          <p>Mediana personale precedente: {format(item.baseline)} {item.unit} ({item.baselineCount}/28 giorni, minimo 14).</p>
          {item.delta !== null ? <p>Differenza: <strong>{item.delta > 0 ? '+' : ''}{format(item.delta)} {item.unit}</strong>
            {item.key === 'sleep_h' && ` (${format(item.delta * 60, 0)} min)`}{item.percent !== null && ` · ${format(item.percent)}%`}</p> : <p>Differenza indisponibile: servono almeno 14 misure valide.</p>}</>
          : <p>Nessuna misura valida nel periodo.</p>}
      </section>)}</div>
        <div className="advanced-controls"><label>Metrica recupero <select value={metricKey} onChange={event => setMetricKey(event.target.value)}>
          {items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label></div>
        {chart(`Mediana mobile · ${metric.label}`, trend.some(point => point.value !== null) ? trend.map(point => ({ ...point, label: point.date })) : [], 'value', metric.unit,
          `Minimo 4 giorni validi su 7 · ${period.end}: ${last?.count ?? 0}/7 · Ultima misura: ${metric.latest?.date ?? 'indisponibile'}`)}</>;
    } else if (view === 'Carico avanzato') {
      const result = advancedLoad(activities, period, covered, today);
      const distribution = loadDistribution(activities, period);
      const complete = lastWeek >= period.start && lastWeek >= archive.start ? lastWeek : null;
      content = <><div className="panel advanced-panel"><h3>Finestre di carico registrato</h3>
        <p>Giorno di riferimento: {period.end} · Distanze e durate valide sul totale delle corse tra parentesi.</p>
        <ul><Totals label="Periodo selezionato" totals={result.selected}/>
          <Totals label={`7 giorni · ${result.last7.start} – ${result.last7.end}`} totals={result.totals7}/>
          <Totals label={`28 giorni · ${result.last28.start} – ${result.last28.end}`} totals={result.totals28}/>
          {complete && <Totals label={`Ultima settimana completa · ${complete}`} totals={loadTotals(activities, { start: complete, end: shift(complete, 6) }, covered)}/>}
        </ul>
        {!complete && <p>Ultima settimana completa indisponibile nell’intervallo osservato.</p>}
        {shift(lastWeek, 6) < period.end && <p>Settimana più recente parziale al {period.end}.</p>}
        <p>Riferimento {result.preceding.start} – {result.preceding.end}: {format(result.baseline)} km/settimana. Rapporto: {result.ratio === null ? result.reason : `${format(result.ratio)}×`}.</p>
      </div><div className="charts">
        {chart('Corse per distanza', result.selected.distanceCount ? distribution.distances : [], 'count', 'corse', undefined, 'bar')}
        {chart('Corse per ritmo', distribution.paces.some(item => item.count) ? distribution.paces : [], 'count', 'corse', undefined, 'bar')}
      </div></>;
    } else {
      const options = weeks(requested ?? { start: period.start < archive.start ? archive.start : period.start, end: period.end }).reverse();
      const chosen = options.includes(week) ? week : options.includes(lastWeek) ? lastWeek : options[0];
      const report = weeklyReport(activities, daily, runs, chosen, period, requested ?? archive, today, selectedKey, covered);
      const markdown = reportMarkdown(report, cohortLabel);
      const blocks = markdown.trim().split('\n\n');
      content = <>{filters}<div className="advanced-controls">
        <label>Settimana del report <select value={chosen} onChange={event => setWeek(event.target.value)}>
          {options.map(option => <option key={option} value={option}>{option}{option > lastWeek || option < period.start || option < archive.start ? ' · parziale' : ''}</option>)}
        </select></label>
        <button className="outline" onClick={() => downloadReport(chosen, markdown)}>Esporta Markdown</button>
      </div><article className="panel advanced-panel">
        {blocks.map((block, i) => {
          const [heading, ...lines] = block.split('\n');
          if (heading.startsWith('## ')) return <section key={heading}><h3>{heading.slice(3)}</h3><ul>{lines.map(line => <li key={line}>{line.slice(2)}</li>)}</ul></section>;
          return i === 0 ? <h2 key={heading}>{heading.slice(2)}</h2> : <p key={heading}>{heading}</p>;
        })}
      </article></>;
    }

    return <><h2>{view}</h2>{context}{content}</>;
  }
}
