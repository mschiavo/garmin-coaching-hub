import { useMemo, useState } from 'react';
import { extendedFields, horizon, inside, shift, type Period } from './analytics/dates';
import { activityMeasureCounts, coverageState, reliability } from './analytics/coverage';
import { sources, type Archive, type Source } from './dataApi';

const labels: Record<Source, string> = {
  activities: 'Attività', sleep: 'Sonno', hrv: 'HRV', body_battery: 'Body Battery',
  stress: 'Stress', daily_summary: 'Riepilogo giornaliero',
};
const states = {
  unknown: 'Sconosciuta', success_with_data: 'Con dati', success_empty: 'Vuota attestata',
  failed: 'Fallita', unsupported: 'Non supportata', partial: 'Parziale',
} as const;
const reliabilityLabels = {
  verified: 'Verificata', historical: 'Storica', conflict: 'In conflitto', partial: 'Parziale', unknown: 'Sconosciuta',
} as const;
const sourceFields = { sleep: ['sleep_h'], hrv: ['hrv'], body_battery: ['bb_charged','bb_drained'],
  stress: ['stress'], daily_summary: ['resting_hr','steps'] } as const;

export function QualityCenter({ archive, period, today }: { archive: Archive; period: Period; today: string }) {
  const [source, setSource] = useState<Source>('activities');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const observed = horizon(archive.activities, archive.daily, today);
  const activities = archive.activities.filter(row => inside(row.date, period));
  const measures = activityMeasureCounts(activities);
  const daily = archive.daily.filter(row => inside(row.date, period));
  const first = observed?.start ?? period.end;
  const start = archive.requested?.start ?? (period.start > first ? period.start : first);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let day = start; day <= period.end; day = shift(day, 1)) out.push(day);
    return out.reverse();
  }, [start, period.end]);
  const index = useMemo(() => new Map(archive.coverage.map(row => [`${row.date}/${row.source}`, row])), [archive.coverage]);
  const capable = archive.metadata?.reliability_version === 1;
  const recorded = new Map<string, number>();
  for (const row of activities) recorded.set(row.date, (recorded.get(row.date) ?? 0) + 1);
  const byDate = new Map(daily.map(row => [row.date, row]));
  const countFor = (day: string, kind: Source) => {
    if (kind === 'activities') return recorded.get(day) ?? 0;
    const dailyRow = byDate.get(day);
    return dailyRow ? sourceFields[kind].filter(field => typeof dailyRow[field] === 'number' && Number.isFinite(dailyRow[field])).length : 0;
  };
  const stateFor = (day: string, kind: Source) => reliability(index.get(`${day}/${kind}`), day, today, countFor(day, kind), capable);
  const matching = days.filter(day => filter === 'all' || stateFor(day, source).state === filter);
  const current = Math.min(page, Math.max(0, Math.ceil(matching.length / 31) - 1));
  const extent = archive.metadata;
  const shown = matching.slice(current * 31, (current + 1) * 31);
  const ratio = (n: number, total: number) => total ? `${n}/${total} · ${Math.round(n * 100 / total)}%` : '— (0 righe)';
  const dailyFields = [
    ['sleep_h','Sonno'], ['hrv','HRV'], ['resting_hr','FC a riposo'], ['stress','Stress'],
    ['bb_charged','Body Battery caricata'], ['bb_drained','Body Battery scaricata'], ['steps','Passi'],
  ] as const;
  function download() {
    const tasks = days.slice(0, 31).flatMap(date => sources.filter(kind => stateFor(date, kind).state !== 'verified')
      .map(kind => ({ date, source: kind })));
    const url = URL.createObjectURL(new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'garmin-piano-recupero.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="panel advanced-panel" aria-label="Qualità dei dati">
    <h2>Stato dell’archivio</h2>
    <dl>
      <dt>Modalità API</dt><dd>{extent ? 'V2 · trasferimento verificato' : 'Legacy · massimo 2.000 righe per collezione'}</dd>
      <dt>Intervallo richiesto</dt><dd>{period.start} – {period.end}</dd>
      <dt>Intervallo acquisito</dt><dd>{archive.acquired ? `${archive.acquired.start} – ${archive.acquired.end}` : 'Indeterminato'}</dd>
      <dt>Intervallo osservato</dt><dd>{observed ? `${observed.start} – ${observed.end}` : 'Archivio vuoto'}</dd>
      <dt>Righe caricate / dichiarate</dt><dd>Attività {archive.activities.length}/{extent?.activities.count ?? '—'} · Giornate {archive.daily.length}/{extent?.daily.count ?? '—'} · Copertura {archive.coverage.length}/{extent?.coverage.count ?? '—'}</dd>
      <dt>Metadati di copertura</dt><dd>{extent?.coverage_status === 'available' ? 'Disponibili per le fonti e i giorni indicati' : 'Sconosciuti'}</dd>
      <dt>Verifica archivio</dt><dd>{capable ? 'Concordanza disponibile per le giornate riesaminate' : 'Funzionalità assente in questa versione del database'}</dd>
      <dt>Ultimo aggiornamento</dt><dd>{archive.updated_at ? new Date(archive.updated_at).toLocaleString('it-IT') : 'Indisponibile'}</dd>
      <dt>Anomalie e troncamento</dt><dd>{extent ? `Attività ${extent.anomalies.activities} · Giornate ${extent.anomalies.daily} · nessun troncamento nel trasferimento` : 'Anomalie sconosciute · possibile troncamento legacy'}</dd>
    </dl>

    <h3>Misure valide nel periodo</h3>
    <p>Denominatori delle attività e delle righe giornaliere osservate. I giorni sconosciuti sono conteggiati a parte.</p>
    <ul>
      <li>Distanza {ratio(measures.distance, activities.length)}</li>
      <li>Durata {ratio(measures.duration, activities.length)}</li>
      <li>FC media {ratio(measures.heartRate, activities.length)}</li>
      {dailyFields.map(([field, label]) => <li key={field}>{label} {ratio(daily.filter(row => typeof row[field] === 'number' &&
        Number.isFinite(row[field]) && (['sleep_h','hrv','resting_hr'].includes(field) ? row[field]! > 0 : row[field]! >= 0)).length, daily.length)}</li>)}
    </ul>
    {extent && <><h3>Metriche estese</h3>
      <ul>{extendedFields.map(([field, label, unit]) => <li key={field}>{label} ({unit}) {ratio(
        activities.filter(row => typeof row[field] === 'number' && Number.isFinite(row[field])).length, activities.length
      )}</li>)}</ul>
      <p>VO₂max, sequenza dei lap e durata delle pause sono indisponibili.</p>
    </>}

    <h3>Copertura giornaliera</h3>
    <p>La concordanza riguarda l’archivio attuale. L’evidenza precedente rimane consultabile anche dopo un tentativo fallito.</p>
    <div className="advanced-controls">
      <label>Fonte <select value={source} onChange={e => { setSource(e.target.value as Source); setPage(0); }}>
        {sources.map(kind => <option key={kind} value={kind}>{labels[kind]}</option>)}
      </select></label>
      <label>Stato <select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>
        <option value="all">Tutti</option>{Object.entries(reliabilityLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}
      </select></label>
    </div>
    <ul aria-label="Legenda e conteggi">{Object.entries(reliabilityLabels).map(([state, label]) =>
      <li key={state}>{label} · {days.filter(day => stateFor(day, source).state === state).length}/{days.length} giorni</li>)}</ul>
    {shown.length ? <div className="quality-table" tabIndex={0} role="region" aria-label="Tabella scorrevole della copertura">
      <table><caption>Copertura · {labels[source]}</caption><thead><tr>
        {['Data','Concordanza','Ultimo tentativo','Ultima evidenza','Archivio','Ultima riconciliazione'].map(label => <th key={label} scope="col">{label}</th>)}
      </tr></thead><tbody>{shown.map(day => {
        const row = index.get(`${day}/${source}`);
        const check = stateFor(day, source);
        return <tr key={day}><th scope="row">{day}</th>
          <td>{reliabilityLabels[check.state]} · {check.reason}</td>
          <td>{states[coverageState(row)]}{row?.attempted_at ? ` · ${new Date(row.attempted_at).toLocaleString('it-IT')}` : ''}{row?.error_code ? ` · ${row.error_code}` : ''}</td>
          <td>{row?.evidence ? `${states[row.evidence]} · ${row.succeeded_at ? new Date(row.succeeded_at).toLocaleString('it-IT') : '—'}` : '—'}</td>
          <td>{countFor(day, source)}</td>
          <td>{row?.observed_count ?? '—'}{row?.missing_count ? ` · ${row.missing_count} non restituite` : ''}</td>
        </tr>;
      })}</tbody></table>
    </div> : <p>Nessuna giornata per il filtro selezionato.</p>}
    <div className="advanced-controls">
      <button className="outline" disabled={!current} onClick={() => setPage(current - 1)}>Giorni più recenti</button>
      <button className="outline" disabled={(current + 1) * 31 >= matching.length} onClick={() => setPage(current + 1)}>Giorni precedenti</button>
    </div>
    {extent && <><h3>Piano di recupero</h3>
      <p>Il file elenca le lacune degli ultimi 31 giorni del periodo. Per verificare il piano sul database usa <code>repair_garmin.py</code> in modalità dry-run.</p>
      <button className="outline" onClick={download}>Esporta piano di recupero</button>
    </>}
  </section>;
}
