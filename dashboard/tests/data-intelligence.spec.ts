import { expect, test, type Page } from '@playwright/test';
import { extendedFields } from '../src/analytics/dates';

test.use({ timezoneId: 'America/Los_Angeles' });

const date = '2024-02-29';
const activities = Array.from({ length: 2501 }, (_, i) => ({
  id: String(9007199254740993n + BigInt(i)), date, type: 'running', name: null,
  distance_m: 1000, duration_s: 420, average_hr: 145,
  ...Object.fromEntries(extendedFields.map(([key]) => [key,key === 'cadence_spm' ? 165 : null])),
}));
const coverage = [
  { date, source: 'activities', attempt_state: 'failed', evidence: 'success_with_data',
    attempted_at: '2024-03-03T12:00:00Z', succeeded_at: '2024-03-02T12:00:00Z',
    item_count: 2501, quality: 'validated', error_code: 'http_503',
    reconciliation: 'verified', observed_count: 2501, missing_count: 0 },
  { date, source: 'sleep', attempt_state: 'partial', evidence: null,
    attempted_at: '2024-03-03T12:00:00Z', succeeded_at: null, item_count: null, quality: null, error_code: null },
];

async function setup(page: Page) {
  const state = { denied: false, failPage: false, duplicate: false, conflict: false, logoutFails: false,
    pause: false, legacy: 0, pending: 0, pages: 0, unexpected: [] as string[] };
  let release = () => {};
  const wait = () => new Promise<void>(resolve => { release = resolve; });
  await page.clock.setFixedTime(new Date('2024-03-04T23:30:00Z'));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'fonts.googleapis.com' && url.pathname === '/css2') return route.fulfill({ body: '', contentType: 'text/css' });
    if (url.origin === 'https://analytics-fixture.invalid') {
      if (url.pathname === '/auth/v1/token') {
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const email = route.request().postDataJSON().email as string;
        const userId = email === 'second@example.invalid' ? 'second-user' : 'synthetic-user';
        return route.fulfill({ json: {
          access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: userId, exp: 2147483647 })}.c3ludGhldGlj`,
          refresh_token: 'synthetic-token', expires_in: 3600, token_type: 'bearer',
          user: { id: userId, aud: 'authenticated', email,
            app_metadata: {}, user_metadata: {}, created_at: '2024-01-01T00:00:00Z' },
        } });
      }
      if (url.pathname === '/auth/v1/logout') {
        return state.logoutFails ? route.fulfill({ status: 400, json: { message: 'synthetic' } }) : route.fulfill({ status: 204 });
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = url.pathname.split('/').at(-1);
        const args = route.request().postDataJSON();
        const auth = route.request().headers().authorization?.split('.')[1];
        const second = auth && JSON.parse(Buffer.from(auth, 'base64url').toString()).sub === 'second-user';
        const archiveActivities = second ? [] : activities;
        const archiveCoverage = second ? [] : state.conflict ? [
          { ...coverage[0], attempt_state: 'success_empty', evidence: 'success_empty', item_count: 0,
            quality: 'source_empty', reconciliation: 'conflict', observed_count: 0, missing_count: 2501 },
          coverage[1],
        ] : coverage;
        if (fn === 'dashboard_data') state.legacy++;
        if (fn === 'dashboard_metadata_v2') {
          if (state.denied) return route.fulfill({ status: 403, json: { code: '42501' } });
          return route.fulfill({ json: {
            api_version: 2, schema_version: 34, revision: '1', reliability_version: 1,
            coverage_status: second ? 'unknown' : 'available', updated_at: '2024-03-02T12:00:00Z',
            anomalies: { activities: 0, daily: 0 }, activities: { min: second ? null : date, max: second ? null : date, count: archiveActivities.length },
            daily: { min: null, max: null, count: 0 }, coverage: { min: second ? null : date, max: second ? null : date, count: archiveCoverage.length },
          } });
        }
        if (['dashboard_activities_v2','dashboard_daily_v2','dashboard_coverage_v2'].includes(fn ?? '')) {
          const source = fn === 'dashboard_activities_v2' ? archiveActivities : fn === 'dashboard_coverage_v2' ? archiveCoverage : [];
          const start = args.p_after_key ? activities.findIndex(row => row.id === args.p_after_key) + 1 : 0;
          if (fn === 'dashboard_activities_v2') {
            state.pages++;
            if (start && state.failPage) return route.fulfill({ status: 500, json: { code: 'XX000' } });
            if (state.pause) {
              state.pause = false;
              state.pending++;
              await wait();
            }
          }
          const rows = source.slice(start, start + 250);
          if (fn === 'dashboard_activities_v2' && start && state.duplicate) rows[0] = activities[0];
          const has_more = start + rows.length < source.length;
          return route.fulfill({ json: { rows, count: rows.length, limit: 250, revision: '1', has_more,
            next_cursor: has_more ? { date, key: activities[start + rows.length - 1].id } : null } });
        }
      }
    }
    state.unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  return { state, resume: () => release() };
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('runner@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: /Accedi alla dashboard/ }).click();
  await page.getByRole('button', { name: 'Qualità dei dati' }).click();
}

test('V2 paginates past 2000, reconciles coverage and exports a local repair plan', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1440, height: 900 });
  const { state } = await setup(page);
  await signIn(page);
  const quality = page.getByRole('region', { name: 'Qualità dei dati', exact: true });
  await expect(quality.getByText(/Attività 2501\/2501/)).toBeVisible();
  expect(state.pages).toBe(11);
  await expect(quality.getByText(/Cadenza media .*2501\/2501/)).toBeVisible();
  await quality.getByLabel('Stato').selectOption('historical');
  const table = quality.getByRole('table');
  await expect(table.getByRole('row').nth(1)).toContainText('Fallita');
  await expect(table.getByRole('row').nth(1)).toContainText('Storica');
  await expect(table.getByRole('row').nth(1)).toContainText('Con dati');
  await quality.getByLabel('Fonte').selectOption('sleep');
  await quality.getByLabel('Stato').selectOption('partial');
  await expect(table.getByRole('row').nth(1)).toContainText('Parziale');
  const pending = page.waitForEvent('download');
  await quality.getByRole('button', { name: 'Esporta piano di recupero' }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('garmin-piano-recupero.json');
  const { readFile } = await import('node:fs/promises');
  const tasks = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(tasks).toContainEqual({ date, source: 'sleep' });
  expect(Object.keys(tasks[0]).sort()).toEqual(['date','source']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(isMobile ? 390 : 1440);
  expect(state.legacy).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test('403 and page errors keep incomplete archives out of analytics', async ({ page }) => {
  const { state } = await setup(page);
  state.denied = true;
  await signIn(page);
  await expect(page.getByRole('alert')).toHaveText('Accesso negato all’archivio.');
  state.denied = false;
  state.failPage = true;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Lettura dell’archivio non riuscita. Riprova.');
  await expect(page.getByRole('table')).toHaveCount(0);
  state.failPage = false;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(page.getByText(/Attività 2501\/2501/)).toBeVisible();
  expect(state.legacy).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test('range change and logout discard requests that finish late', async ({ page }) => {
  const { state, resume } = await setup(page);
  state.pause = true;
  await signIn(page);
  await expect.poll(() => state.pending).toBe(1);
  await page.getByLabel('Intervallo').selectOption('30');
  await expect(page.getByText(/Attività 2501\/2501/)).toBeVisible();
  resume();
  await expect(page.getByText(/2024-02-05 – 2024-03-05/)).toBeVisible();

  state.pause = true;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect.poll(() => state.pending).toBe(2);
  await page.getByRole('button', { name: 'Disconnetti' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  resume();
  await expect(page.getByText(/Attività 2501\/2501/)).toHaveCount(0);
  expect(state.legacy).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test('conflict remains visible after retry and a second account never reads the first archive', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 375 : 1440, height: 900 });
  const { state, resume } = await setup(page);
  state.conflict = true;
  state.duplicate = true;
  await signIn(page);
  await expect(page.getByRole('alert')).toContainText('Pagina duplicata');
  state.duplicate = false;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await page.getByLabel('Stato').selectOption('conflict');
  await expect(page.getByRole('table')).toContainText('2501 non restituite');
  await expect(page.getByRole('table')).toContainText('In conflitto');
  state.pause = true;
  state.logoutFails = true;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect.poll(() => state.pending).toBe(1);
  await page.getByRole('button', { name: 'Disconnetti' }).click();
  await expect(page.getByRole('alert')).toContainText('Disconnessione remota non confermata');
  await page.getByLabel('Email').fill('second@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: /Accedi alla dashboard/ }).click();
  await page.getByRole('button', { name: 'Qualità dei dati' }).click();
  await expect(page.getByText(/Attività 0\/0/)).toBeVisible();
  resume();
  await expect(page.getByText(/Attività 2501\/2501/)).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
});
