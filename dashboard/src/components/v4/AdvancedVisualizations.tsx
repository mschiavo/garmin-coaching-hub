import { useState } from 'react';
import { Activity, Gauge, HeartPulse, Target, TrendingUp, Watch } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { color, Plot } from '../../charts';
import { DataState } from './DataState';
import { calculateRingProgress } from './ringProgress';

export type RingSeries = { id: string; label: string; actual: number | null; target: number | null; unit: string; color: string; status: 'available' | 'partial' | 'missing' | 'demo' };

/** Concentric SVG rings; visual progress is capped at 100%, while text preserves over-target values. */
export function MultiProgressRing({ series, size = 250, title = 'Progressi rispetto ai target', compact = false }: { series: RingSeries[]; size?: number; title?: string; compact?: boolean }) {
  const usable = series.filter(item => item.status !== 'missing' && calculateRingProgress(item.actual, item.target) != null && item.unit.trim());
  const hasDemo = usable.some(item => item.status === 'demo');
  return <section className={`v4-advanced-card v4-ring-card ${compact ? 'v4-ring-card--compact' : ''}`} aria-label={title}>
    <header className="v4-advanced-heading"><div><span className="v4-card-kicker">{hasDemo ? 'OBIETTIVI · DEMO' : 'OBIETTIVI'}</span><h2>{title}</h2><p>Anelli normalizzati sul target; il progresso visuale si ferma al 100%.</p></div><Target aria-hidden="true"/></header>
    {usable.length ? <div className="v4-multi-ring-layout">
      <div className="v4-multi-ring" style={{ width: size, maxWidth: '100%', aspectRatio: '1' }} role="img" aria-label={usable.map(s => `${s.label}: ${s.actual} di ${s.target} ${s.unit}, ${Math.round(s.actual! / s.target! * 100)} percento${s.status === 'partial' ? ', parziale' : ''}${s.status === 'demo' ? ', dato sintetico demo' : ''}`).join('. ')}>
        <svg viewBox="0 0 100 100" aria-hidden="true">{usable.map((item, index) => {
          const radius = 45 - index * Math.min(8, 32 / usable.length);
          const circumference = Math.PI * 2 * radius;
          const percentage = calculateRingProgress(item.actual, item.target)!.visualPercentage / 100;
          return <g key={item.id} transform="rotate(-90 50 50)"><circle className="v4-ring-track" cx="50" cy="50" r={radius} strokeWidth="4.2"/><circle cx="50" cy="50" r={radius} stroke={item.color} strokeWidth="4.2" strokeLinecap="round" strokeDasharray={`${circumference * percentage} ${circumference}`} className="v4-ring-value"/></g>;
        })}</svg>
        <div className="v4-multi-ring-center"><strong>{compact && usable.length === 1 ? `${Math.round(usable[0].actual! / usable[0].target! * 100)}%` : usable.length}</strong><span>{compact ? 'del target' : <>obiettivi<br/>con target valido</>}</span></div>
      </div>
      <div className="v4-ring-legend">{usable.map(item => {
        const actual = item.actual!, target = item.target!; const percent = calculateRingProgress(actual, target)!.percentage;
        return <div className={`v4-ring-item v4-ring-item--${item.status}`} key={item.id} style={{ '--ring-color': item.color } as React.CSSProperties}>
          <span className="v4-ring-swatch" style={{ '--ring-color': item.color } as React.CSSProperties}/>
          <div><strong>{item.label}</strong><small>{actual.toLocaleString('it-IT')} / {target.toLocaleString('it-IT')} {item.unit} · {item.status === 'partial' ? 'campione parziale' : item.status === 'demo' ? 'dato sintetico demo' : 'osservato'}</small></div>
          <b>{Math.round(percent)}%</b>
        </div>;
      })}</div>
    </div> : <DataState kind="empty" title="Obiettivi non disponibili">Servono misure valide e target configurati. I dati mancanti non vengono convertiti in zero.</DataState>}
    <p className="v4-visual-footnote">Percentuale = valore attuale ÷ target × 100. Gli anelli oltre il target restano saturi; la percentuale testuale non viene limitata.</p>
    <details className="v4-accessible-table"><summary>Tabella testuale dei progressi</summary><div className="v4-table-scroll"><table><caption>{title}</caption><thead><tr><th>Indicatore</th><th>Attuale</th><th>Target</th><th>Avanzamento</th><th>Qualità</th></tr></thead><tbody>{series.map(item => <tr key={item.id}><td>{item.label}</td><td>{item.actual ?? '—'} {item.unit}</td><td>{item.target ?? '—'} {item.unit}</td><td>{item.actual != null && item.target ? `${Math.round(item.actual / item.target * 100)}%` : '—'}</td><td>{item.status}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export type RadarAxis = { key: string; label: string; value: number | null; target: number | null };
/** Values are normalized to the documented 0–100 scale; null values stay absent. */
export function RadarProfileChart({ axes, demo = false }: { axes: RadarAxis[]; demo?: boolean }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const enough = axes.length >= 5 && axes.filter(axis => axis.value != null && Number.isFinite(axis.value)).length >= 3;
  const data = axes.map(axis => ({ subject: axis.label, actual: axis.value, target: axis.target, key: axis.key }));
  return <section className="v4-advanced-card v4-radar-card" aria-labelledby="v4-radar-title">
    <header className="v4-advanced-heading"><div><span className="v4-card-kicker">{demo ? 'PROFILO · DEMO SINTETICA' : 'PROFILO OSSERVATO'}</span><h2 id="v4-radar-title">Profilo attuale e obiettivo</h2><p>Scala normalizzata 0–100; il punteggio non è una metrica fisiologica.</p></div><Gauge aria-hidden="true"/></header>
    {enough ? <>
      <div className="v4-radar-legend"><span><i className="v4-legend-dot"/> Profilo attuale</span><span><i className="v4-legend-dot v4-legend-dot--target"/> Profilo obiettivo</span><small>Seleziona un asse per evidenziarlo</small></div>
      <div className="v4-radar-chart"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data} outerRadius="68%" onMouseMove={state => setActiveKey(typeof state?.activeTooltipIndex === 'number' ? axes[state.activeTooltipIndex]?.key ?? null : null)} onMouseLeave={() => setActiveKey(null)}>
        <PolarGrid stroke="var(--border-subtle)"/><PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 13 }}/><PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={6} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false}/>
        <Radar name="Obiettivo" dataKey="target" stroke={color.mint} fill={color.mint} fillOpacity={0.12} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false}/><Radar name="Profilo attuale" dataKey="actual" stroke={color.cyan} fill={color.cyan} fillOpacity={0.28} strokeWidth={2} connectNulls={false} isAnimationActive={false}/>
        <Tooltip isAnimationActive={false} contentStyle={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 9, color: 'var(--text-primary)' }} labelStyle={{ color: 'var(--text-primary)' }} formatter={(value, name) => value == null ? ['Non disponibile', name] : [`${value}/100`, name]}/>
      </RadarChart></ResponsiveContainer></div>
      {activeKey && <p className="v4-radar-focus" role="status">Asse selezionato: {axes.find(axis => axis.key === activeKey)?.label}</p>}
      <div className="v4-radar-table-wrap"><table><caption>Valori radar normalizzati da 0 a 100</caption><thead><tr><th>Indicatore</th><th>Attuale</th><th>Obiettivo</th><th>Copertura</th></tr></thead><tbody>{axes.map(axis => <tr key={axis.key}><th scope="row">{axis.label}</th><td>{axis.value == null ? '—' : `${axis.value}/100`}</td><td>{axis.target == null ? '—' : `${axis.target}/100`}</td><td>{axis.value == null ? 'Assente' : 'Presente'}</td></tr>)}</tbody></table></div>
    </> : <DataState kind="empty" title="Profilo radar non disponibile">Sono necessari almeno cinque assi configurati e tre valori attuali attendibili. Gli assi mancanti restano vuoti, senza imputazioni.</DataState>}
    <p className="v4-visual-footnote">Scala demo: ciascun asse è già normalizzato dal fixture su 0–100; i valori non rappresentano VO₂max, soglie o score fisiologici. {demo ? 'Tutti i punti mostrati sono sintetici.' : 'La scala reale richiede una normalizzazione definita per indicatore.'}</p>
  </section>;
}

const demoTag = <span className="v4-demo-label">DATI SINTETICI · SOLO PREVIEW OFFLINE</span>;
const goalRings: RingSeries[] = [
  { id: 'distance', label: 'Distanza settimanale', actual: 36.3, target: 42, unit: 'km', color: 'var(--chart-blue)', status: 'demo' },
  { id: 'sessions', label: 'Sedute', actual: 4, target: 7, unit: 'sedute', color: 'var(--chart-mint)', status: 'demo' },
  { id: 'time', label: 'Tempo di corsa', actual: 3.6, target: 4, unit: 'h', color: 'var(--chart-cyan)', status: 'demo' },
  { id: 'consistency', label: 'Costanza', actual: 4, target: 7, unit: 'giorni attivi', color: 'var(--chart-violet)', status: 'demo' },
];
const radarAxes: RadarAxis[] = [
  { key: 'endurance', label: 'Resistenza', value: 78, target: 85 }, { key: 'consistency', label: 'Costanza', value: 84, target: 90 },
  { key: 'speed', label: 'Velocità', value: 62, target: 74 }, { key: 'recovery', label: 'Recupero', value: 71, target: 80 },
  { key: 'volume', label: 'Volume', value: 80, target: 82 }, { key: 'balance', label: 'Equilibrio', value: 68, target: 76 },
];

export function GoalCenterPreview() {
  return <section className="v4-advanced-page" aria-label="Goal Center demo">{demoTag}
    <div className="v4-goal-hero"><MultiProgressRing series={goalRings} size={300} title="Avanzamento dei tuoi obiettivi"/><div className="v4-goal-side"><div className="v4-advanced-card v4-goal-status"><span className="v4-card-kicker">STATO SETTIMANA · DEMO</span><h2>Quattro sedute registrate</h2><p>La fixture mostra quattro attività e 36,3 km nella settimana; il piano resta un target dimostrativo.</p><div className="v4-goal-mini-rings">{goalRings.map(item => {
      const progress = calculateRingProgress(item.actual, item.target)!;
      return <div key={item.id} aria-label={`${item.label}: ${Math.round(progress.percentage)} percento demo`}><span className="v4-goal-mini-ring" style={{ '--ring-color': item.color, '--ring-angle': `${progress.visualPercentage * 3.6}deg` } as React.CSSProperties}><b>{Math.round(progress.percentage)}%</b></span><small>{item.label}</small></div>;
    })}</div><div className="v4-goal-stats"><div><strong>36,3 km</strong><span>volume demo</span></div><div><strong>4 / 7</strong><span>sedute demo</span></div><div><strong>4 / 7</strong><span>giorni attivi demo</span></div></div></div></div></div>
    <RadarProfileChart axes={radarAxes} demo/>
    <div className="v4-goal-objectives v4-advanced-card"><header className="v4-advanced-heading"><div><span className="v4-card-kicker">OBIETTIVI ATTIVI</span><h2>Priorità del blocco</h2></div><Target/></header><div className="v4-objective-list">{goalRings.slice(0, 3).map(item => <div key={item.id}><span style={{ '--ring-color': item.color } as React.CSSProperties}/><div><strong>{item.label}</strong><small>Target dimostrativo: {item.target} {item.unit}</small></div><b>{Math.round(item.actual! / item.target! * 100)}%</b></div>)}</div></div>
  </section>;
}

const week = [
  { label: 'Lun', plan: 6, actual: 6.1 }, { label: 'Mar', plan: 6, actual: 0 }, { label: 'Mer', plan: 6, actual: 12.6 },
  { label: 'Gio', plan: 6, actual: 0 }, { label: 'Ven', plan: 6, actual: 7.2 }, { label: 'Sab', plan: 6, actual: 0 }, { label: 'Dom', plan: 6, actual: 10.4 },
];
const cumulative = week.reduce<{ label: string; target: number; actual: number; deviation: number }[]>((rows, day) => {
  const previous = rows.at(-1); const target = (previous?.target ?? 0) + day.plan; const actual = (previous?.actual ?? 0) + day.actual;
  rows.push({ label: day.label, target, actual, deviation: actual - target }); return rows;
}, []);

export function WeeklyProgressPreview() {
  return <section className="v4-advanced-page" aria-label="Progresso settimanale demo">{demoTag}
    <MultiProgressRing series={goalRings} size={226} title="Riepilogo degli obiettivi settimanali"/>
    <div className="v4-weekly-layout"><div className="v4-advanced-card v4-weekly-main"><header className="v4-advanced-heading"><div><span className="v4-card-kicker">VOLUME CORSA · KM</span><h2>Target e attività osservate</h2><p>Il target è pianificato solo in questa fixture demo; non esiste una API Planning persistente collegata.</p></div><Activity/></header>
      <Plot title="Andamento cumulativo" subtitle="Somma giornaliera del volume sintetico" data={cumulative} series={[{ key: 'target', name: 'Target cumulativo (km)', color: color.mint }, { key: 'actual', name: 'Eseguito cumulativo (km)', color: color.cyan }]} kind="line" height={285} meta={{ x: 'Giorno della settimana', y: 'Distanza cumulativa (km)', unit: 'km', zero: true }}/>
      <Plot title="Previsto vs eseguito" subtitle="Chilometri per giorno" data={week} series={[{ key: 'plan', name: 'Previsto (km)', color: color.blue }, { key: 'actual', name: 'Eseguito (km)', color: color.mint }]} kind="bar" height={250} barMaxSize={28} meta={{ x: 'Giorno', y: 'Distanza (km)', unit: 'km', zero: true }}/>
      <div className="v4-week-deviations"><h3>Scostamenti rispetto al target</h3>{week.map(day => <div key={day.label} className={day.actual >= day.plan ? 'is-ahead' : 'is-behind'}><span>{day.label}</span><i><b style={{ width: `${Math.min(day.actual / day.plan * 100, 120)}%` }}/></i><strong>{day.actual >= day.plan ? '+' : ''}{(day.actual - day.plan).toLocaleString('it-IT', { maximumFractionDigits: 1 })} km</strong></div>)}</div>
    </div><aside className="v4-weekly-aside"><div className="v4-advanced-card"><span className="v4-card-kicker">SINTESI SETTIMANALE</span><h2>36,3 km</h2><p>volume completato · valore puramente dimostrativo</p><div className="v4-weekly-stat"><span>Target previsto</span><strong>42 km</strong></div><div className="v4-weekly-stat"><span>Scostamento</span><strong className="is-behind">−5,7 km</strong></div><div className="v4-weekly-stat"><span>Giorni registrati</span><strong>4 / 7</strong></div></div><div className="v4-advanced-card"><span className="v4-card-kicker">LETTURA</span><h2>Leggermente sotto il piano demo</h2><p>Il volume effettivo sintetico è sotto il piano sintetico. Nessun dato pianificato viene presentato come dato dell'account.</p></div></aside></div>
  </section>;
}

const performanceTrend = [
  { label: '16–22 dic', vo2: 54.6, vdot: 50.9 }, { label: '23–29 dic', vo2: 55.1, vdot: 51.6 }, { label: '30 dic–5 gen', vo2: 55.7, vdot: 52.3 }, { label: '6–12 gen', vo2: 56.3, vdot: 52.8 },
];
const paceHr = Array.from({ length: 25 }, (_, index) => ({ pace: 250 + index * 3.4 + (index % 4) * 1.8, hr: 127 + index * 1.65 + (index % 5) * 2.2 }));
const zones = [{ label: 'Z1 · Recupero', value: 24 }, { label: 'Z2 · Facile', value: 38 }, { label: 'Z3 · Medio', value: 20 }, { label: 'Z4 · Soglia', value: 12 }, { label: 'Z5 · Intenso', value: 6 }];

export function PerformanceLabPreview() {
  return <section className="v4-advanced-page" aria-label="Performance Lab demo">{demoTag}
    <div className="v4-performance-summary">{[
      { label: 'VO₂max stimato', value: '56,3', unit: 'ml/kg/min', tone: 'cyan', icon: HeartPulse }, { label: 'VDOT', value: '52,8', unit: 'indice demo', tone: 'violet', icon: TrendingUp }, { label: 'Ritmo medio demo', value: '4:12', unit: 'min/km', tone: 'blue', icon: Watch },
    ].map(({ label, value, unit, tone, icon: Icon }) => <article className={`v4-advanced-card v4-performance-kpi v4-tone-${tone}`} key={label}><Icon/><span>{label}</span><strong>{value}</strong><small>{unit} · serie sintetica</small></article>)}</div>
    <section className="v4-advanced-card"><header className="v4-advanced-heading"><div><span className="v4-card-kicker">SERIE STORICHE DEMO</span><h2>Andamento VO₂max e VDOT</h2><p>Due serie sintetiche separate, ciascuna letta sulla propria unità e scala.</p></div><TrendingUp/></header>
      <div className="v4-trend-pair">{[
        { key: 'vo2', title: 'VO₂max', unit: 'ml/kg/min', color: color.cyan, domain: [53, 57] }, { key: 'vdot', title: 'VDOT', unit: 'indice', color: color.violet, domain: [50, 54] },
      ].map(metric => <div className="v4-mini-trend" key={metric.key}><h3>{metric.title} <small>{metric.unit}</small></h3><Plot title={metric.title} data={performanceTrend} series={[{ key: metric.key, name: `${metric.title} · demo (${metric.unit})`, color: metric.color }]} kind="line" height={215} meta={{ x: 'Settimana', y: `${metric.title} (${metric.unit})`, unit: metric.unit }}/><p className="v4-visual-footnote">Scala demo {metric.domain[0]}–{metric.domain[1]} {metric.unit} · dati sintetici, non derivati dall'atleta.</p></div>)}
      </div>
    </section>
    <div className="v4-performance-grid"><section className="v4-advanced-card"><header className="v4-advanced-heading"><div><span className="v4-card-kicker">CORSA · DEMO</span><h2>Ritmo e frequenza cardiaca</h2><p>Punti sintetici: asse X in secondi/km, asse Y in bpm.</p></div><Activity/></header><Plot title="Ritmo vs frequenza cardiaca" data={paceHr} series={[{ key: 'pace', name: 'Campione sintetico', color: color.cyan }]} kind="scatter" height={290} meta={{ x: 'Ritmo (s/km)', y: 'FC media (bpm)', unit: 'bpm' }}/></section>
      <section className="v4-advanced-card"><header className="v4-advanced-heading"><div><span className="v4-card-kicker">DISTRIBUZIONE · DEMO</span><h2>Zone di intensità</h2><p>Ripartizione sintetica del tempo di esempio.</p></div><Gauge/></header><div className="v4-zone-list">{zones.map((zone, index) => <div key={zone.label}><span>{zone.label}</span><i><b style={{ width: `${zone.value}%`, background: [color.cyan, color.mint, color.blue, color.amber, color.violet][index] }}/></i><strong>{zone.value}%</strong></div>)}</div><div className="v4-race-projections"><h3>Proiezioni gara · demo</h3>{[{ name: '5 km', value: '18:32' }, { name: '10 km', value: '38:47' }, { name: 'Mezza maratona', value: '1:26:20' }].map(race => <div key={race.name}><span>{race.name}</span><strong>{race.value}</strong><small>stima sintetica</small></div>)}</div></section></div>
    <p className="v4-performance-disclaimer">Le metriche VO₂max, VDOT e le proiezioni sono esempi grafici sintetici per la preview. La dashboard collegata non crea né mostra stime fisiologiche senza una fonte e un metodo attendibili.</p>
  </section>;
}
