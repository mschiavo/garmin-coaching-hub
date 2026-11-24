import { extendedFields, shift, validDate, type ActivityRow, type DailyRow, type Period } from './analytics/dates.ts';

export const sources = ['activities', 'sleep', 'hrv', 'body_battery', 'stress', 'daily_summary'] as const;
export type Source = typeof sources[number];
export type Evidence = 'success_with_data' | 'success_empty';
export type Coverage = {
  date: string; source: Source; attempt_state: Evidence | 'failed' | 'unsupported' | 'partial';
  evidence: Evidence | null; attempted_at: string; succeeded_at: string | null;
  item_count: number | null; quality: string | null; error_code: string | null;
  reconciliation?: 'verified' | 'conflict' | 'invalidated' | null;
  observed_count?: number | null; missing_count?: number | null;
};
type Cursor = { date: string; key?: string };
type Extent = { min: string | null; max: string | null; count: number };
type Metadata = {
  api_version: 2; schema_version: 34; revision: string; activities: Extent; daily: Extent;
  reliability_version?: 1;
  coverage: Extent; coverage_status: 'available' | 'unknown'; anomalies: { activities: number; daily: number }; updated_at: string | null;
};
type Collection = 'activities' | 'daily' | 'coverage';
type Page<T> = { revision: string; limit: number; count: number; has_more: boolean; next_cursor: Cursor | null; rows: T[] };
type Rpc = (name: string, args: Record<string, unknown>, signal: AbortSignal) =>
  PromiseLike<{ data: unknown; error: { code?: string } | null; status?: number }>;

export type Archive = {
  activities: ActivityRow[]; daily: DailyRow[]; updated_at: string | null;
  metadata: Metadata | null; coverage: Coverage[]; requested: Period | null; acquired: Period | null;
};

const maxRows = 100000;
const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const dateOrNull = (value: unknown) => value === null || (typeof value === 'string' && validDate(value));
const numberOrNull = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n));
const activityId = (id: unknown) => typeof id === 'string' && /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
const metricFields = ['sleep_h','hrv','resting_hr','stress','bb_charged','bb_drained','steps'];
const hasMetrics = (row: object, keys: string[]) => keys.every(key => numberOrNull((row as Record<string, unknown>)[key]));

export class ArchiveError extends Error {
  readonly code: string;

  constructor(code: string, message = 'Risposta API inattesa.') {
    super(message);
    this.code = code;
  }
}

async function call(rpc: Rpc, name: string, args: Record<string, unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  const result = await rpc(name, args, signal);
  signal.throwIfAborted();
  if (result.error) {
    const code = result.error.code;
    if (result.status === 401 || result.status === 403 || code === '42501') {
      throw new ArchiveError('denied', 'Accesso negato all’archivio.');
    }
    if (result.status === 404 && (code === 'PGRST202' || code === '42883')) throw new ArchiveError('missing', 'Funzione API assente. Verifica la migrazione V3.4.');
    if (code === '40001') throw new ArchiveError('revision', 'Archivio aggiornato durante la lettura. Riprova.');
    throw new ArchiveError('request', 'Lettura dell’archivio non riuscita. Riprova.');
  }
  return result.data;
}

function metadata(value: unknown): Metadata {
  const m = value as Metadata;
  if (!m || m.api_version !== 2 || m.schema_version !== 34 ||
    (m.reliability_version !== undefined && m.reliability_version !== 1) ||
    typeof m.revision !== 'string' || !/^\d{1,19}$/.test(m.revision) ||
    ![m.activities,m.daily,m.coverage].every(e => e && integer(e.count) && dateOrNull(e.min) && dateOrNull(e.max) &&
      (e.min === null ? e.max === null : e.max !== null && e.min <= e.max)) ||
    m.coverage_status !== (m.coverage.count ? 'available' : 'unknown') ||
    !integer(m.anomalies?.activities) || !integer(m.anomalies?.daily) ||
    !(m.updated_at === null || typeof m.updated_at === 'string')) throw new ArchiveError('schema');
  return m;
}

function cursorFor(kind: Collection, row: ActivityRow | DailyRow | Coverage): Cursor {
  if (!row || typeof row.date !== 'string' || !validDate(row.date)) throw new ArchiveError('schema');
  if (kind === 'activities') {
    const activity = row as ActivityRow;
    if (!activityId(activity.id) || !hasMetrics(activity, ['distance_m','duration_s','average_hr', ...extendedFields.map(([key]) => key)]) ||
      ![activity.name,activity.type].every(value => value === null || typeof value === 'string')) throw new ArchiveError('schema');
    return { date: row.date, key: String(activity.id) };
  }
  if (kind === 'coverage') {
    const coverage = row as Coverage;
    if (!sources.includes(coverage.source) ||
      !['success_with_data','success_empty','failed','unsupported','partial'].includes(coverage.attempt_state) ||
      ![null,'success_with_data','success_empty'].includes(coverage.evidence) ||
      typeof coverage.attempted_at !== 'string' ||
      !(coverage.succeeded_at === null || typeof coverage.succeeded_at === 'string') ||
      ![undefined,null,'verified','conflict','invalidated'].includes(coverage.reconciliation) ||
      ![coverage.observed_count,coverage.missing_count].every(n => n == null || integer(n)) ||
      !(coverage.item_count === null || integer(coverage.item_count))) throw new ArchiveError('schema');
    return { date: row.date, key: coverage.source };
  }
  if (!hasMetrics(row, metricFields)) throw new ArchiveError('schema');
  return { date: row.date };
}

function after(a: Cursor, b: Cursor, kind: Collection) {
  if (a.date !== b.date) return a.date > b.date;
  if (kind === 'activities') return BigInt(a.key!) > BigInt(b.key!);
  return (a.key ?? '') > (b.key ?? '');
}

async function pages<T extends ActivityRow | DailyRow | Coverage>(
  rpc: Rpc, kind: Collection, period: Period, m: Metadata, signal: AbortSignal, progress: (n: number) => void
) {
  const count = m[kind].count;
  if (count > maxRows) throw new ArchiveError('limit', 'Limite di 100.000 righe per collezione. Scegli un intervallo più breve.');
  const rows: T[] = [];
  const ids = new Set<string>();
  let cursor: Cursor | null = null;
  for (;;) {
    const p = await call(rpc, `dashboard_${kind}_v2`, {
      p_start: period.start, p_end: period.end, p_revision: m.revision, p_limit: 250,
      ...(cursor ? { p_after_date: cursor.date, ...(cursor.key ? { p_after_key: cursor.key } : {}) } : {}),
    }, signal) as Page<T>;
    if (!p || p.revision !== m.revision || p.limit !== 250 || !Array.isArray(p.rows) ||
      p.count !== p.rows.length || p.count > 250 || typeof p.has_more !== 'boolean' ||
      (p.has_more && p.count !== 250)) throw new ArchiveError('page');
    for (const row of p.rows) {
      const next = cursorFor(kind, row);
      if (next.date < period.start || next.date > period.end || (cursor && !after(next, cursor, kind))) {
        throw new ArchiveError('page', 'Pagina duplicata o fuori ordine. Riprova.');
      }
      if (kind === 'activities') {
        if (ids.has(next.key!)) throw new ArchiveError('page');
        ids.add(next.key!);
      }
      cursor = next;
      rows.push(row);
    }
    if (rows.length > count || p.has_more !== (rows.length < count)) throw new ArchiveError('page', 'Pagina mancante o conteggio incoerente. Riprova.');
    progress(p.count);
    if (!p.has_more) {
      if (p.next_cursor !== null) throw new ArchiveError('page');
      return rows;
    }
    if (!p.next_cursor || !cursor || p.next_cursor.date !== cursor.date || p.next_cursor.key !== cursor.key) throw new ArchiveError('page');
  }
}

export async function readArchive(
  rpc: Rpc, range: string, today: string, signal: AbortSignal,
  notify: (loaded: number, total: number) => void = () => {}
): Promise<Archive> {
  for (let attempt = 0; ; attempt++) {
    try {
      let archive: Metadata;
      try {
        archive = metadata(await call(rpc, 'dashboard_metadata_v2', { p_end: today }, signal));
      } catch (error) {
        if (!(error instanceof ArchiveError) || error.code !== 'missing') throw error;
        const legacy = await call(rpc, 'dashboard_data', {}, signal) as Archive;
        if (!legacy || !Array.isArray(legacy.activities) || !Array.isArray(legacy.daily) ||
          legacy.activities.some(row => !row || (row.date !== null && typeof row.date !== 'string')) ||
          legacy.daily.some(row => !row || typeof row.date !== 'string') ||
          !(legacy.updated_at === null || typeof legacy.updated_at === 'string')) throw new ArchiveError('schema');
        return { activities: legacy.activities, daily: legacy.daily, updated_at: legacy.updated_at,
          metadata: null, coverage: [], requested: null, acquired: null };
      }
      const end = today;
      const dates = [archive.activities.min, archive.daily.min, archive.coverage.min]
        .filter((date): date is string => date !== null && date <= end).sort();
      const requested = { start: range === 'all' ? dates[0] ?? end : shift(end, 1 - Number(range)), end };
      if (requested.start < shift(end, -15000)) throw new ArchiveError('limit', 'Limite di 15.001 giorni. Scegli un intervallo più breve.');
      const acquired = { start: range === 'all' ? requested.start : shift(requested.start, -Math.max(56, Number(range))), end };
      const m = metadata(await call(rpc, 'dashboard_metadata_v2', { p_start: acquired.start, p_end: end }, signal));
      if (archive.revision !== m.revision || archive.reliability_version !== m.reliability_version) {
        throw new ArchiveError('revision', 'Archivio aggiornato durante la lettura. Riprova.');
      }
      const total = m.activities.count + m.daily.count + m.coverage.count;
      let loaded = 0;
      const progress = (n: number) => notify(loaded += n, total);
      progress(0);
      const activities = await pages<ActivityRow>(rpc, 'activities', acquired, m, signal, progress);
      const daily = await pages<DailyRow>(rpc, 'daily', acquired, m, signal, progress);
      const coverage = await pages<Coverage>(rpc, 'coverage', acquired, m, signal, progress);
      return { activities, daily, coverage, metadata: m, requested, acquired, updated_at: m.updated_at };
    } catch (error) {
      if (!(error instanceof ArchiveError) || error.code !== 'revision' || attempt >= 1) throw error;
    }
  }
}
