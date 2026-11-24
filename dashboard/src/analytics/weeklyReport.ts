import { inside, median, shift, weeks, type ActivityRow, type DailyRow, type Period } from './dates.ts';
import { cohortKey, type EfficientRun } from './efficiency.ts';
import { coverageNote, loadTotals } from './load.ts';
import { recovery } from './recovery.ts';

export function weeklyReport(rows: ActivityRow[], daily: DailyRow[], runs: EfficientRun[], week: string, selected: Period, observed: Period, today: string, cohort: string) {
  const sunday = shift(week, 6);
  const period = { start: [week, selected.start, observed.start].sort().at(-1)!, end: [sunday, selected.end, observed.end, today].sort()[0] };
  const previous = { start: shift(week, -7), end: shift(week, -1) };
  const priorFour = { start: shift(week, -28), end: previous.end };
  const totals = loadTotals(rows, period);
  const partial = period.start > week || period.end < sunday || sunday >= today || observed.start > week;
  const prior = observed.start <= previous.start && observed.end >= previous.end ? loadTotals(rows, previous) : null;
  const fourWeeks = observed.start <= priorFour.start && observed.end >= priorFour.end
    ? weeks(priorFour).map(start => loadTotals(rows, { start, end: shift(start, 6) })) : null;
  const fourKm = fourWeeks?.every(value => value.km !== null)
    ? fourWeeks.reduce((sum, value) => sum + (value.km ?? 0) / 4, 0) : null;
  const comparable = runs.filter(run => inside(run.row.date, period) && cohortKey(run.cohort) === cohort);
  const measures = recovery(daily, period);
  const fourHours = fourWeeks?.every(value => value.hours !== null)
    ? fourWeeks.reduce((sum, value) => sum + (value.hours ?? 0) / 4, 0) : null;
  const fourRuns = fourWeeks ? fourWeeks.reduce((sum, value) => sum + value.runs / 4, 0) : null;
  const fourActive = fourWeeks ? fourWeeks.reduce((sum, value) => sum + value.active / 4, 0) : null;
  return { week, period, totals, partial, prior, fourKm, fourHours, fourRuns, fourActive, efficiency: median(comparable.map(run => run.index)), count: comparable.length,
    measures, observed, cohort, metricDays: new Set(daily.filter(row => inside(row.date, period)).map(row => row.date)).size };
}

export const format = (number: number | null | undefined, digits = 2) => number == null || !Number.isFinite(number)
  ? '—' : number.toLocaleString('it-IT', { maximumFractionDigits: digits });

export function reportMarkdown(report: ReturnType<typeof weeklyReport>, cohortLabel: string): string {
  const { totals, prior, fourKm, measures } = report;
  return [
    '# Report settimanale Garmin',
    '', `Settimana del ${report.week} · ${report.period.start} – ${report.period.end} · ${report.partial ? 'parziale' : 'conclusa'}`,
    '', '## Volume, durata e frequenza',
    `- ${format(totals.km)} km (${totals.distanceCount}/${totals.runs} distanze valide)`,
    `- ${format(totals.hours)} h registrate (${totals.durationCount}/${totals.runs} durate valide)`,
    `- ${totals.runs} corse registrate in ${totals.active} giorni attivi`,
    '', '## Confronti',
    prior ? `- Settimana precedente · ${format(prior.km)} km, ${format(prior.hours)} h, ${prior.runs} corse, ${prior.active} giorni attivi` : '- Settimana precedente · orizzonte insufficiente',
    report.fourRuns === null ? '- Media delle quattro settimane precedenti · dati insufficienti' : `- Media delle quattro settimane precedenti · ${format(fourKm)} km, ${format(report.fourHours)} h, ${format(report.fourRuns)} corse, ${format(report.fourActive)} giorni attivi`,
    '', '## Efficienza',
    `- ${cohortLabel} · ${format(report.efficiency, 4)} km/h per bpm · ${report.count} corse valide`,
    '', '## Recupero',
    ...measures.map(metric => metric.latest
      ? `- ${metric.label} · ${format(metric.latest.value)} ${metric.unit} il ${metric.latest.date} · riferimento ${format(metric.baseline)} ${metric.unit} (${metric.baselineCount}/28 giorni, minimo 14) · differenza ${format(metric.delta)} ${metric.unit} ${metric.percent === null ? "" : `(${format(metric.percent)}%)`}${metric.key === "sleep_h" && metric.delta !== null ? ` · ${format(metric.delta * 60, 0)} min` : ""}`
      : `- ${metric.label} · nessuna misura valida nella settimana`),
    '', '## Qualità e osservazioni',
    `- Orizzonte osservato ${report.observed.start} – ${report.observed.end}. ${coverageNote}`,
    `- ${report.metricDays} date con righe giornaliere nel periodo.`,
    totals.runs === 0 ? '- Nessuna corsa registrata nel periodo.' : `- Corse registrate in ${totals.active} giorni distinti.`,
    !report.partial && totals.km !== null && prior?.km != null
      ? `- Differenza di volume registrato dalla settimana precedente: ${format(totals.km - prior.km)} km.`
      : '- Differenza settimanale omessa per periodo parziale o dati insufficienti.',
    '',
  ].join('\n');
}
