import { advancedLoad } from './load.ts';
import { efficiency, efficiencyChange } from './efficiency.ts';
import { monday, shift, validDate, type ActivityRow, type DailyRow, type Period } from './dates.ts';
import { recovery } from './recovery.ts';

export const COACHING_RULESET_VERSION = 'gch-coach-rules/0.1.0';

export type EvidenceStatus = 'available' | 'partial' | 'unknown' | 'invalid';
export type Severity = 'info' | 'caution' | 'review_required';
export type AthleteGoal = { id: string; kind: 'distance' | 'race' | 'consistency'; target: number | null; targetDate?: string | null; unit: string; provenance: string };
export type PlanCycle = { id: string; start: string; end: string; goalId?: string | null; provenance: string };
export type PlannedWorkout = {
  id: string; date: string; title: string; kind: 'easy' | 'quality' | 'long' | 'cross_training' | 'rest';
  durationMinutes: number | null; intensity: 'easy' | 'moderate' | 'hard' | 'unspecified'; status: 'planned' | 'completed' | 'cancelled';
};
export type ObservedActivity = ActivityRow & { plannedWorkoutId?: string | null; provenance?: string };
export type RecoverySignal = { metric: string; value: number | null; baseline: number | null; baselineSampleCount: number; status: EvidenceStatus; source: string; observedOn: string | null };
export type CoverageEvidence = { date: string; status: EvidenceStatus; source: string; reason?: string };
export type ProposalEvidence = { code: string; status: EvidenceStatus; summary: string; sources: string[]; sampleCount: number; period: Period | null };
export type ProposalDecision = 'maintain' | 'modify' | 'abstain';
export type WorkoutChange = { before: PlannedWorkout; after: PlannedWorkout };
export type CoachProposal = {
  id: string; decision: ProposalDecision; severity: Severity; title: string; explanation: string;
  reason_codes: string[]; evidence: ProposalEvidence[]; change: WorkoutChange | null; alternatives: string[];
  validUntil: string; algorithmVersion: string; requiresHumanApproval: true;
};
export type TrainingAssessment = {
  algorithmVersion: string; referenceDate: string; status: EvidenceStatus; situation: string;
  rulesApplied: { reviewAfterVerifiedMisses: number; proposalHorizonDays: number };
  sessions: { eligible: number; completed: number; missedVerified: number; uncertain: number };
  runningLoad: ReturnType<typeof advancedLoad>;
  performance: { status: EvidenceStatus; changePercent: number | null; recentSamples: number; priorSamples: number };
  recovery: RecoverySignal[];
  proposals: CoachProposal[];
  limitations: string[];
};
export type CoachingInput = {
  goal: AthleteGoal | null; cycle: PlanCycle | null; workouts: PlannedWorkout[];
  activities: ObservedActivity[]; daily: DailyRow[]; coverage: CoverageEvidence[];
  referenceDate: string; rules?: { reviewAfterVerifiedMisses?: number; proposalHorizonDays?: number };
};

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const sameCoverage = (a: CoverageEvidence, b: CoverageEvidence) =>
  a.date === b.date && a.status === b.status && a.source === b.source && a.reason === b.reason;
const periodFor = (end: string, days: number): Period => ({ start: shift(end, 1 - days), end });
const isCivilDate = (value: unknown): value is string => typeof value === 'string' && validDate(value);
const uniqueById = <T extends { id: string | number }>(rows: T[]) => {
  const map = new Map<string, T>();
  const conflicts = new Set<string>();
  for (const row of rows) {
    const key = String(row.id);
    if (!idPattern.test(key)) { conflicts.add(key); continue; }
    const old = map.get(key);
    if (old) conflicts.add(key);
    else if (!old) map.set(key, row);
  }
  return { rows: [...map.values()].filter(row => !conflicts.has(String(row.id))), conflicts };
};

function proposal(input: Omit<CoachProposal, 'algorithmVersion' | 'requiresHumanApproval'>): CoachProposal {
  return { ...input, algorithmVersion: COACHING_RULESET_VERSION, requiresHumanApproval: true };
}

/** Pure, deterministic assessment. It returns suggestions only; it never mutates the supplied plan. */
export function assessTraining(input: CoachingInput): TrainingAssessment {
  const validReference = isCivilDate(input.referenceDate);
  const date = validReference ? input.referenceDate : '0001-01-01';
  const cycleValid = input.cycle === null || (idPattern.test(input.cycle.id) && isCivilDate(input.cycle.start) && isCivilDate(input.cycle.end) && input.cycle.start <= input.cycle.end);
  const requestedRules = { reviewAfterVerifiedMisses: input.rules?.reviewAfterVerifiedMisses ?? 2, proposalHorizonDays: input.rules?.proposalHorizonDays ?? 7 };
  const rulesValid = Number.isSafeInteger(requestedRules.reviewAfterVerifiedMisses) && requestedRules.reviewAfterVerifiedMisses >= 1 && requestedRules.reviewAfterVerifiedMisses <= 10 &&
    Number.isSafeInteger(requestedRules.proposalHorizonDays) && requestedRules.proposalHorizonDays >= 1 && requestedRules.proposalHorizonDays <= 14;
  const rules = rulesValid ? requestedRules : { reviewAfterVerifiedMisses: 2, proposalHorizonDays: 7 };
  const workouts = uniqueById(input.workouts);
  const activities = uniqueById(input.activities);
  const workoutMap = new Map(workouts.rows.map(row => [row.id, row]));
  const coverageDates = new Map<string, CoverageEvidence>();
  let coverageConflict = false;
  for (const row of input.coverage) {
    if (!isCivilDate(row.date) || typeof row.source !== 'string' || !row.source || !['available', 'partial', 'unknown', 'invalid'].includes(row.status)) coverageConflict = true;
    const previous = coverageDates.get(row.date);
    if (previous && !sameCoverage(previous, row)) coverageConflict = true;
    coverageDates.set(row.date, row);
  }
  const activityLinkConflict = activities.rows.some(activity => {
    if (!isCivilDate(activity.date)) return true;
    if (!activity.plannedWorkoutId) return false;
    const workout = workoutMap.get(activity.plannedWorkoutId);
    return !workout || workout.status === 'cancelled' || workout.date !== activity.date;
  });
  const conflicts = workouts.conflicts.size > 0 || activities.conflicts.size > 0;
  const badWorkout = workouts.rows.some(w => !isCivilDate(w.date) || typeof w.title !== 'string' || !w.title.trim() ||
    !['easy', 'quality', 'long', 'cross_training', 'rest'].includes(w.kind) || !['easy', 'moderate', 'hard', 'unspecified'].includes(w.intensity) ||
    !['planned', 'completed', 'cancelled'].includes(w.status) ||
    (w.durationMinutes !== null && (!Number.isFinite(w.durationMinutes) || w.durationMinutes <= 0)));
  const cycleMismatch = !!input.cycle && workouts.rows.some(w => w.date < input.cycle!.start || w.date > input.cycle!.end);
  const invalid = !validReference || !cycleValid || conflicts || badWorkout || cycleMismatch || coverageConflict ||
    input.coverage.some(row => row.status === 'invalid') || activityLinkConflict ||
    !rulesValid ||
    (input.goal !== null && (!idPattern.test(input.goal.id) || !['distance', 'race', 'consistency'].includes(input.goal.kind) || typeof input.goal.unit !== 'string' ||
      (input.goal.target !== null && (!Number.isFinite(input.goal.target) || input.goal.target <= 0)) ||
      (input.goal.targetDate != null && !isCivilDate(input.goal.targetDate)))) ||
    (!!input.cycle?.goalId && !!input.goal && input.cycle.goalId !== input.goal.id);
  const priorDays = validReference ? periodFor(shift(date, -1), 28) : { start: '0001-01-01', end: '0001-01-01' };
  const week = validReference ? periodFor(shift(date, -1), 7) : priorDays;
  const futureEnd = validReference ? shift(date, rules.proposalHorizonDays) : date;
  const coverageMap = new Map(input.coverage.map(row => [row.date, row]));
  const covered = (period: Period) => {
    if (!validDate(period.start) || !validDate(period.end) || period.end >= date) return false;
    for (let day = period.start; day <= period.end; day = shift(day, 1)) if (coverageMap.get(day)?.status !== 'available') return false;
    return true;
  };
  const load = advancedLoad(input.activities, week, covered, date);
  const runs = efficiency(input.activities);
  const perf = validReference ? efficiencyChange(runs, monday(shift(date, -1))) : { recent: 0, previous: 0, change: null };
  const perfStatus: EvidenceStatus = perf.change === null ? (perf.recent || perf.previous ? 'partial' : 'unknown') : 'available';
  const recoveryRows = recovery(input.daily, priorDays);
  const recoverySignals: RecoverySignal[] = recoveryRows.map(signal => ({
    metric: signal.key, value: signal.latest?.value ?? null, baseline: signal.baseline,
    baselineSampleCount: signal.baselineCount, status: signal.latest ? 'available' : 'unknown',
    source: 'daily_summary', observedOn: signal.latest?.date ?? null,
  }));

  const past = workouts.rows.filter(w => w.status !== 'cancelled' && w.date < date && (!input.cycle || (w.date >= input.cycle.start && w.date <= input.cycle.end)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const future = workouts.rows.filter(w => w.status === 'planned' && w.date >= date && w.date <= futureEnd).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const activityByWorkout = new Map<string, ObservedActivity[]>();
  for (const activity of activities.rows) {
    if (!activity.plannedWorkoutId) continue;
    const list = activityByWorkout.get(activity.plannedWorkoutId) ?? [];
    list.push(activity); activityByWorkout.set(activity.plannedWorkoutId, list);
  }
  const matched = past.filter(w => activityByWorkout.has(w.id) && activityByWorkout.get(w.id)!.length === 1);
  const missed = past.filter(w => w.status === 'planned' && !activityByWorkout.has(w.id) && coverageMap.get(w.date)?.status === 'available');
  const uncertain = past.length - matched.length - missed.length;
  const sessionStatus: EvidenceStatus = invalid ? 'invalid' : past.length === 0 ? 'unknown' : uncertain ? 'partial' : 'available';
  const evidence = (code: string, status: EvidenceStatus, summary: string, sources: string[], sampleCount: number, period: Period | null): ProposalEvidence => ({ code, status, summary, sources, sampleCount, period });
  const planEvidence = evidence('PLAN_VS_ACTUAL', sessionStatus,
    `${matched.length} sedute associate esplicitamente; ${missed.length} sedute senza attività in giornate coperte; ${uncertain} non valutabili.`,
    [input.cycle?.provenance ?? 'piano fornito in input', 'attività con plannedWorkoutId esplicito', 'copertura attività per giorno'], past.length, past.length ? { start: past[0].date, end: past[past.length - 1].date } : null);
  const goalEvidence = evidence('ATHLETE_GOAL', input.goal ? 'available' : 'unknown',
    input.goal ? `Obiettivo ${input.goal.kind}: target ${input.goal.target ?? 'non impostato'} ${input.goal.unit}${input.goal.targetDate ? ` · data ${input.goal.targetDate}` : ''}.` : 'Nessun obiettivo atleta configurato nell’input.',
    input.goal ? [input.goal.provenance || 'obiettivo fornito'] : ['obiettivo non fornito'], input.goal ? 1 : 0, input.cycle && cycleValid ? { start: input.cycle.start, end: input.cycle.end } : null);
  const loadEvidence = evidence('RUNNING_VOLUME', load.totals7.distanceComplete ? 'available' : load.totals7.runs ? 'partial' : 'unknown',
    load.totals7.km === null ? 'Volume non quantificabile con copertura e distanze complete.' : `${load.totals7.km.toFixed(1)} km registrati nella finestra; misura descrittiva, non carico fisiologico.`,
    ['analytics/load.ts', 'attività archiviate', 'copertura attività'], load.totals7.distanceCount, load.last7);
  const recoveryEvidence = evidence('RECOVERY_CONTEXT', input.daily.length ? 'partial' : 'unknown',
    'Le misure recovery sono mostrate come contesto descrittivo e non determinano da sole una prescrizione.',
    ['analytics/recovery.ts', 'daily_summary'], input.daily.length, priorDays);
  const performanceEvidence = evidence('PERFORMANCE_COHORT', perfStatus,
    perf.change === null ? 'Confronto di coorte omogenea non disponibile: campioni insufficienti.' : `Variazione descrittiva della coorte: ${perf.change.toFixed(1)}%.`,
    ['analytics/efficiency.ts', 'attività complete'], perf.recent + perf.previous, priorDays);

  const proposals: CoachProposal[] = [];
  const validity = validReference ? futureEnd : date;
  const baseAlternatives = ['Nessuna modifica: mantenere il piano attuale.', 'Rivedere manualmente obiettivo, disponibilità e contesto prima di applicare cambiamenti.'];
  if (invalid) {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:abstain:invalid`, decision: 'abstain', severity: 'review_required', title: 'Dati incoerenti: nessuna proposta',
      explanation: 'Il piano o i riferimenti contengono date, identificativi o valori in conflitto. Correggere la fonte prima di valutare adattamenti.', reason_codes: ['INPUT_INVALID_OR_CONFLICTING'], evidence: [planEvidence], change: null, alternatives: baseAlternatives, validUntil: validity }));
  } else if (!input.cycle || past.length === 0) {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:abstain:insufficient-plan`, decision: 'abstain', severity: 'caution', title: 'Informazioni insufficienti',
      explanation: 'Serve un ciclo e almeno una seduta passata valutabile per distinguere aderenza e mancanza di copertura. Nessuna seduta viene inferita dalle attività.', reason_codes: ['PLAN_OR_HISTORY_MISSING'], evidence: [planEvidence, loadEvidence, recoveryEvidence, performanceEvidence], change: null, alternatives: baseAlternatives, validUntil: validity }));
  } else if (uncertain > 0) {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:abstain:coverage`, decision: 'abstain', severity: 'caution', title: 'Copertura insufficiente per valutare il piano',
      explanation: 'Una seduta senza attività non viene classificata come saltata se la copertura del giorno non è verificata. Completa o riconcilia i dati prima di adattare il piano.', reason_codes: ['ACTIVITY_COVERAGE_INCOMPLETE'], evidence: [planEvidence, loadEvidence, recoveryEvidence], change: null, alternatives: baseAlternatives, validUntil: validity }));
  } else if (input.goal?.kind === 'race' && input.goal.targetDate && input.goal.targetDate >= date && input.goal.targetDate <= futureEnd) {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:abstain:event:${input.goal.id}:${input.goal.targetDate}`, decision: 'abstain', severity: 'caution', title: 'Gara nell’orizzonte di valutazione',
      explanation: 'La gara indicata è entro i prossimi sette giorni. Questo MVP non dispone di regole specifiche di tapering o post-gara: non modifica sedute vicino all’evento e richiede revisione umana.', reason_codes: ['GOAL_EVENT_WITHIN_HORIZON', 'EVENT_CONTEXT_UNMODELED'], evidence: [planEvidence, loadEvidence, recoveryEvidence, goalEvidence], change: null, alternatives: ['Confermare il piano gara e il recupero con atleta/coach.'], validUntil: validity }));
  } else if (missed.length >= rules.reviewAfterVerifiedMisses && future.some(w => w.kind === 'quality' && w.intensity === 'hard')) {
    const before = future.find(w => w.kind === 'quality' && w.intensity === 'hard')!;
    const after: PlannedWorkout = { ...before, title: `${before.title} · versione facile proposta`, kind: 'easy', intensity: 'easy' };
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:modify:${before.id}:${before.date}`, decision: 'modify', severity: 'caution', title: 'Rivedere una seduta futura',
      explanation: `${missed.length} sedute pianificate non risultano associate ad attività in giornate con copertura verificata. Come revisione prudenziale del calendario (non come valutazione di fatica), valuta di convertire una seduta intensa in facile. Non recuperare automaticamente le sedute mancanti.`, reason_codes: ['REPEATED_VERIFIED_PLAN_DEVIATION', 'NO_AUTOMATIC_CATCH_UP'], evidence: [planEvidence, loadEvidence, recoveryEvidence, performanceEvidence], change: { before, after }, alternatives: baseAlternatives, validUntil: validity }));
  } else if (missed.length > 0) {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:abstain:verified-deviation`, decision: 'abstain', severity: 'info', title: 'Scostamento verificato: nessun recupero automatico',
      explanation: `Sono state verificate ${missed.length} sedute pianificate senza attività associata, ma non c’è una seduta intensa eleggibile nell’orizzonte. Il motore non accumula né riprogramma sedute in automatico.`, reason_codes: ['VERIFIED_DEVIATION_NO_ELIGIBLE_TARGET', 'NO_AUTOMATIC_CATCH_UP'], evidence: [planEvidence, loadEvidence], change: null, alternatives: baseAlternatives, validUntil: validity }));
  } else {
    proposals.push(proposal({ id: `${COACHING_RULESET_VERSION}:maintain:${input.cycle.id}:${date}`, decision: 'maintain', severity: 'info', title: 'Nessuna modifica consigliata',
      explanation: 'Le sedute passate valutabili risultano associate esplicitamente ad attività e la copertura è completa. Mantieni il piano corrente; il contesto recovery non viene interpretato come diagnosi.', reason_codes: ['PLAN_ADHERENCE_OBSERVED', 'NO_CHANGE_REQUIRED'], evidence: [planEvidence, loadEvidence, recoveryEvidence, performanceEvidence], change: null, alternatives: ['Continuare il monitoraggio alla prossima sincronizzazione.'], validUntil: validity }));
  }
  for (const item of proposals) item.evidence.push(goalEvidence);

  const status: EvidenceStatus = invalid ? 'invalid' : uncertain ? 'partial' : !input.cycle || past.length === 0 ? 'unknown' : 'available';
  return { algorithmVersion: COACHING_RULESET_VERSION, referenceDate: date, status,
    rulesApplied: rules,
    situation: proposals[0].explanation,
    sessions: { eligible: past.length, completed: matched.length, missedVerified: missed.length, uncertain },
    runningLoad: load,
    performance: { status: perfStatus, changePercent: perf.change, recentSamples: perf.recent, priorSamples: perf.previous },
    recovery: recoverySignals, proposals, limitations: [
      'Obiettivo e piano sono input espliciti effimeri; non sono collegati a Planning persistente.',
      'Solo plannedWorkoutId collega un’attività a una seduta; la coincidenza di data non prova l’associazione.',
      'Le regole descrivono aderenza e calendario, non fatica, rischio o diagnosi. La soglia di revisione è configurabile e non clinica.',
      'Le misure Garmin restano descrittive; segnali discordanti o senza baseline non producono score né prescrizioni e non determinano da sole una modifica.',
      'Accettazione e rifiuto sono simulazioni client: nessun dato o piano viene scritto.'
    ] };
}
