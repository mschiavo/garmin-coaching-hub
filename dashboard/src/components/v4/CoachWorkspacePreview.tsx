import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CircleHelp, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { assessTraining, type CoachingInput, type CoachProposal, type PlannedWorkout } from '../../analytics/coaching';

const referenceDate = '2026-11-28';
const cycle = { id: 'demo-cycle-autumn', start: '2026-11-01', end: '2026-12-06', goalId: 'demo-goal-10k', provenance: 'fixture sintetica locale' };
const baseWorkouts: PlannedWorkout[] = [
  { id: 'demo-easy-1', date: '2026-11-23', title: 'Corsa facile', kind: 'easy', durationMinutes: 35, intensity: 'easy', status: 'planned' },
  { id: 'demo-quality-1', date: '2026-11-25', title: 'Ripetute controllate', kind: 'quality', durationMinutes: 45, intensity: 'hard', status: 'planned' },
  { id: 'demo-long-future', date: '2026-11-30', title: 'Seduta di qualità', kind: 'quality', durationMinutes: 50, intensity: 'hard', status: 'planned' },
];
const activity = (id: string, date: string, plannedWorkoutId: string) => ({ id, date, type: 'running', name: 'Corsa demo', distance_m: 7000, duration_s: 2400, average_hr: 140, plannedWorkoutId, provenance: 'fixture sintetica' });
const completeCoverage = baseWorkouts.slice(0, 2).map(workout => ({ date: workout.date, status: 'available' as const, source: 'fixture sintetica', reason: 'giornata verificata' }));
const recoveryRows = [
  { date: '2026-11-27', hrv: 53, sleep_h: 7.5, resting_hr: 51, stress: 24, bb_charged: null, bb_drained: null, steps: null },
  { date: '2026-11-28', hrv: 49, sleep_h: 7.1, resting_hr: 53, stress: 31, bb_charged: null, bb_drained: null, steps: null },
];

const scenarios: { id: string; label: string; input: CoachingInput; note: string }[] = [
  { id: 'maintain', label: 'Piano rispettato', note: 'Attività collegate esplicitamente alle sedute e copertura verificata.', input: {
    goal: { id: 'demo-goal-10k', kind: 'race', target: 6000, unit: 's', provenance: 'obiettivo demo' }, cycle,
    workouts: baseWorkouts, activities: [activity('demo-activity-1', '2026-11-23', 'demo-easy-1'), activity('demo-activity-2', '2026-11-25', 'demo-quality-1')],
    daily: recoveryRows, coverage: completeCoverage, referenceDate,
  } },
  { id: 'modify', label: 'Rivedi seduta futura', note: 'Due scostamenti verificati; proposta limitata al calendario, senza inferire fatica.', input: {
    goal: null, cycle, workouts: baseWorkouts, activities: [], daily: recoveryRows,
    coverage: completeCoverage, referenceDate,
  } },
  { id: 'abstain', label: 'Dati incompleti', note: 'Una giornata non ha copertura verificata: lo scostamento resta incerto.', input: {
    goal: null, cycle, workouts: baseWorkouts, activities: [], daily: [],
    coverage: [{ ...completeCoverage[0] }, { date: '2026-11-25', status: 'partial', source: 'fixture sintetica', reason: 'acquisizione parziale' }], referenceDate,
  } },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

function ProposalCard({ proposal, decision, onDecision }: { proposal: CoachProposal; decision: string | null; onDecision: (value: string) => void }) {
  return <article className={`coach-proposal coach-proposal--${proposal.decision}`}>
    <header><span className="coach-decision-badge"><ShieldCheck size={15}/>{proposal.decision === 'maintain' ? 'Mantenimento' : proposal.decision === 'modify' ? 'Proposta da valutare' : 'Astensione'}</span><span className="coach-severity">{proposal.severity === 'info' ? 'Informativo' : proposal.severity === 'caution' ? 'Prudenza' : 'Verifica richiesta'}</span></header>
    <h3>{proposal.title}</h3><p>{proposal.explanation}</p>
    <div className="coach-reason-codes" aria-label="Motivi">{proposal.reason_codes.map(code => <code key={code}>{code}</code>)}</div>
    {proposal.change && <section className="coach-before-after" aria-label="Prima e dopo della seduta">
      <div><small>PRIMA · {formatDate(proposal.change.before.date)}</small><strong>{proposal.change.before.title}</strong><span>{proposal.change.before.durationMinutes ?? '—'} min · {proposal.change.before.intensity}</span></div>
      <span aria-hidden="true">→</span>
      <div><small>DOPO · PROPOSTA</small><strong>{proposal.change.after.title}</strong><span>{proposal.change.after.durationMinutes ?? '—'} min · {proposal.change.after.intensity}</span></div>
    </section>}
    <div className="coach-evidence-list"><h4>Prove e provenienza</h4>{proposal.evidence.map(item => <div key={item.code} className="coach-evidence"><b>{item.code}</b><span>{item.summary}</span><small>{item.status} · {item.sampleCount} elementi · {item.sources.join(' / ')}</small></div>)}</div>
    <ul className="coach-alternatives">{proposal.alternatives.map(item => <li key={item}>{item}</li>)}</ul>
    <div className="coach-simulated-actions"><button type="button" onClick={() => onDecision('accepted')} disabled={decision !== null}><Check size={16}/>Accetta · simulazione</button><button type="button" onClick={() => onDecision('rejected')} disabled={decision !== null}><X size={16}/>Rifiuta · simulazione</button>
      {decision && <span role="status">Decisione {decision === 'accepted' ? 'accettata' : 'rifiutata'} solo in questa preview. Piano invariato.</span>}</div>
  </article>;
}

export function CoachWorkspacePreview() {
  const [scenarioId, setScenarioId] = useState('maintain');
  const [decision, setDecision] = useState<string | null>(null);
  const scenario = scenarios.find(item => item.id === scenarioId)!;
  const assessment = useMemo(() => assessTraining(scenario.input), [scenario]);
  const proposal = assessment.proposals[0];
  return <main className="coach-workspace" aria-label="Coach · Analisi e adattamento">
    <div className="coach-demo-banner"><AlertTriangle size={18}/><div><b>Preview offline · dati sintetici</b><span>Nessun servizio chiamato, nessuna decisione persistita, nessun piano modificato.</span></div><span>REGOLE {assessment.algorithmVersion}</span></div>
    <section className="coach-workspace-heading"><div><p className="v4-card-kicker">COACH · ANALISI E ADATTAMENTO</p><h2>Dal piano a una decisione verificabile.</h2><p>Confronto esplicito tra sedute pianificate, attività associate e copertura. Nessuna diagnosi o prescrizione automatica.</p></div>
      <label>Scenario sintetico<select aria-label="Scenario sintetico" value={scenarioId} onChange={event => { setScenarioId(event.target.value); setDecision(null); }}>{scenarios.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></section>
    <p className="coach-scenario-note"><CircleHelp size={16}/>{scenario.note} Riferimento: {formatDate(referenceDate)}.</p>
    <div className="coach-assessment-grid"><section className="coach-current panel"><header><span className="coach-section-index">01</span><div><h3>Situazione attuale</h3><p>{assessment.status} · {assessment.sessions.eligible} sedute passate valutabili</p></div></header><p>{assessment.situation}</p><dl><div><dt>Associate ad attività</dt><dd>{assessment.sessions.completed}</dd></div><div><dt>Senza attività · copertura verificata</dt><dd>{assessment.sessions.missedVerified}</dd></div><div><dt>Incerte</dt><dd>{assessment.sessions.uncertain}</dd></div></dl>
      <div className="coach-context"><h4>Contesto, non verdetto</h4><p>Volume ultimi 7 giorni: {assessment.runningLoad.totals7.km === null ? 'non completo' : `${assessment.runningLoad.totals7.km.toFixed(1)} km`} · {assessment.runningLoad.reason ?? 'copertura sufficiente per il calcolo descrittivo'}</p><p>Confronto di efficienza: {assessment.performance.changePercent === null ? 'non disponibile' : `${assessment.performance.changePercent.toFixed(1)}%`} · stato {assessment.performance.status}</p><p>{assessment.recovery.length} segnali recovery disponibili nel riepilogo; non determinano da soli la proposta.</p></div>
      <h4>Piano vs eseguito</h4><ol className="coach-session-list">{scenario.input.workouts.map(workout => { const matched = scenario.input.activities.some(activity => activity.plannedWorkoutId === workout.id); const covered = scenario.input.coverage.find(item => item.date === workout.date)?.status === 'available'; const future = workout.date >= referenceDate; const label = workout.status === 'cancelled' ? 'Annullata' : workout.status === 'completed' && !matched ? 'Segnata completata · da verificare' : future ? 'In programma' : matched ? 'Associata' : covered ? 'Nessuna associazione' : 'Copertura incompleta'; const tone = future || workout.status !== 'planned' ? '' : matched ? 'is-complete' : covered ? 'is-missed' : 'is-uncertain'; return <li key={workout.id}><span>{formatDate(workout.date)}</span><b>{workout.title}</b><span className={tone}>{label}</span></li>; })}</ol>
    </section><section className="coach-recommendation"><div className="coach-recommendation-heading"><span className="coach-section-index">02</span><div><h3>Proposta e motivi</h3><p>Valida fino al {formatDate(proposal.validUntil)} · approvazione umana obbligatoria</p></div><button type="button" aria-label="Azzera scelta demo" onClick={() => setDecision(null)}><RotateCcw size={16}/></button></div><ProposalCard proposal={proposal} decision={decision} onDecision={setDecision}/></section></div>
    <details className="coach-method"><summary>Regole, dati e limiti</summary><ul>{assessment.limitations.map(item => <li key={item}>{item}</li>)}</ul><p>La revisione futura richiede almeno {assessment.rulesApplied.reviewAfterVerifiedMisses} sedute non associate con copertura giornaliera verificata e una seduta hard/quality nell’orizzonte configurato di {assessment.rulesApplied.proposalHorizonDays} giorni. È una regola di prodotto configurabile, non una soglia fisiologica.</p></details>
  </main>;
}
