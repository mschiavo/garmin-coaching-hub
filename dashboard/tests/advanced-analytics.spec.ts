import { expect, test } from '@playwright/test';

async function navigateTo(page: import('@playwright/test').Page, id: string) {
  const desktopItem = page.locator(`.v4-sidebar [data-nav-id="${id}"]`);
  const mobileItem = page.locator(`.v4-bottom-navigation [data-nav-id="${id}"]`);
  if (await desktopItem.isVisible().catch(() => false)) return desktopItem.click();
  if (await mobileItem.isVisible().catch(() => false)) return mobileItem.click();
  const desktopMore = page.locator('.v4-sidebar .v4-more-trigger');
  const more = await desktopMore.isVisible().catch(() => false)
    ? desktopMore
    : page.locator('.v4-bottom-navigation .v4-mobile-more');
  if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
  if (await desktopItem.isVisible().catch(() => false)) await desktopItem.click();
  else await mobileItem.click();
}

const fixture = {
  activities: [
    { id: 1, date: '2024-01-10', name: 'Corsa storica sintetica', type: 'running', distance_m: 5000, duration_s: 1800, average_hr: 145 },
    { id: 2, date: '2024-03-04', name: 'Prova sintetica', type: 'running', distance_m: 10000, duration_s: 3600, average_hr: 150 },
    { id: 3, date: '2024-03-06', name: 'Corsa sintetica', type: 'running', distance_m: 11000, duration_s: 3700, average_hr: 154 },
    { id: 4, date: '2024-03-11', name: 'Trail sintetico', type: 'trail_running', distance_m: 8000, duration_s: 3900, average_hr: 162 },
  ],
  daily: Array.from({ length: 32 }, (_, index) => ({
    date: new Date(Date.UTC(2024, 1, 11 + index)).toISOString().slice(0, 10),
    hrv: 50 + index % 7, resting_hr: 56, sleep_h: 7.5, stress: 25, bb_charged: 52, bb_drained: 42, steps: 9000,
  })),
  updated_at: '2024-03-13T12:00:00Z',
};

test('analytics navigation, charts, report export and empty state use only synthetic RPC data', async ({ page, isMobile }, testInfo) => {
  await page.setViewportSize({ width: isMobile ? 375 : 1440, height: 900 });
  const errors: string[] = [];
  const unexpected: string[] = [];
  let empty = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    // Keep the test offline, including the app's optional stylesheet.
    if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    if (url.origin === 'https://analytics-fixture.invalid') {
      if (url.pathname === '/auth/v1/token') {
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'synthetic-user', exp: 2147483647 })}.c3ludGhldGlj`;
        return route.fulfill({ json: { access_token: accessToken, refresh_token: 'synthetic-token', expires_in: 3600, token_type: 'bearer',
          user: { id: 'synthetic-user', aud: 'authenticated', email: 'runner@example.invalid', app_metadata: {}, user_metadata: {}, created_at: fixture.updated_at } } });
      }
      if (url.pathname === '/rest/v1/rpc/dashboard_metadata_v2') return route.fulfill({ status: 404, json: { code: 'PGRST202' } });
      if (url.pathname === '/rest/v1/rpc/dashboard_data') {
        return route.fulfill({ json: empty ? { activities: [], daily: [], updated_at: null } : fixture });
      }
    }
    unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('runner@example.invalid');
  await page.getByLabel('Password').fill('synthetic-password');
  await page.getByRole('button', { name: /Accedi alla dashboard/ }).click();
  await navigateTo(page, 'advanced');
  const analytics = page.getByRole('region', { name: 'Advanced Analytics' });
  const module = analytics.getByLabel('Modulo');
  const type = analytics.getByLabel('Tipo di corsa');
  await page.getByLabel('Intervallo').selectOption('30');
  await expect(page.getByText(/API legacy · massimo 2.000 righe/)).toBeVisible();
  await expect(analytics.getByText(/2 corse valide\./)).toBeVisible();
  const scatter = analytics.locator('.plot').filter({ has: page.getByRole('heading', { name: 'Ritmo e FC media' }) });
  await expect(scatter.getByText('Asse X · Ritmo (s/km)')).toBeVisible();
  await expect(scatter.locator('.recharts-xAxis-tick-labels text').first()).toBeVisible();
  await expect(scatter.locator('.recharts-yAxis-tick-labels text').first()).toBeVisible();
  const dot = scatter.locator('.recharts-scatter-symbol').first();
  if (isMobile) await dot.tap(); else await dot.hover();
  await expect(scatter.locator('.recharts-tooltip-wrapper')).toContainText('bpm');

  await type.focus();
  await page.keyboard.press('ArrowDown');
  await expect(type).toHaveValue('trail_running');
  await expect(analytics.getByText(/1 corsa valida\./)).toBeVisible();
  await type.selectOption('running');
  await page.getByLabel('Intervallo').selectOption('all');
  await analytics.getByLabel('Fascia di distanza').selectOption('2');
  await expect(analytics.getByText(/1 corsa valida\./)).toBeVisible();
  await analytics.getByLabel('Fascia di distanza').selectOption('3');
  await module.selectOption('Prestazioni');
  await expect(analytics.getByText(/Seleziona e conferma/)).toBeVisible();
  await analytics.getByLabel('Attività di riferimento').selectOption('2');
  await analytics.getByRole('checkbox').check();
  await expect(analytics.getByText('5 km · 0 h 28 min 47 s', { exact: true })).toBeVisible();
  await analytics.getByLabel('Attività di riferimento').selectOption('3');
  await expect(analytics.getByRole('checkbox')).not.toBeChecked();
  await expect(analytics.getByText(/Seleziona e conferma/)).toBeVisible();

  await module.selectOption('Recupero');
  await expect(analytics.getByRole('heading', { name: 'Mediana mobile · HRV' })).toBeVisible();
  await analytics.getByLabel('Metrica recupero').selectOption('sleep_h');
  await expect(analytics.getByRole('heading', { name: 'Mediana mobile · Sonno' })).toBeVisible();
  await module.selectOption('Carico avanzato');
  await expect(analytics.getByText('Giorno di riferimento: 2024-03-13', { exact: false })).toBeVisible();
  await expect(analytics.getByRole('heading', { name: 'Corse per ritmo' })).toBeVisible();

  await module.selectOption('Report settimanale');
  const week = analytics.getByLabel('Settimana del report');
  await expect(week).toHaveValue('2024-03-04');
  await week.selectOption('2024-03-11');
  await expect(analytics.getByText(/Settimana del 2024-03-11.*parziale/)).toBeVisible();
  await week.selectOption('2024-03-04');
  const downloadPromise = page.waitForEvent('download');
  await analytics.getByRole('button', { name: 'Esporta Markdown' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('garmin-report-2024-03-04.md');
  const path = testInfo.outputPath('report.md');
  await download.saveAs(path);
  const { readFile } = await import('node:fs/promises');
  const markdown = await readFile(path, 'utf8');
  expect(markdown).toContain('21 km registrati (2/2 distanze valide) · somma parziale');
  expect(markdown).toContain('Copertura attività per tutti i giorni del periodo: incompleta o sconosciuta');
  expect(markdown).toContain('Differenza settimanale omessa');
  expect(markdown).not.toMatch(/NaN|Infinity/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(isMobile ? 375 : 1440);

  if (isMobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(analytics.getByRole('button', { name: 'Esporta Markdown' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  empty = true;
  await page.getByRole('button', { name: 'Aggiorna', exact: true }).click();
  await expect(analytics.getByText('Nessun dato disponibile per Advanced Analytics.')).toBeVisible();
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});
