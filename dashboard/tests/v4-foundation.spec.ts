import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/v4-fixture.html');
});

test('metric card preserves units and represents null without substituting zero', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Distanza sintetica' })).toBeVisible();
  const distance = page.locator('.v4-metric-card').filter({ has: page.getByRole('heading', { name: 'Distanza sintetica' }) });
  await expect(distance.locator('.v4-metric-card__value strong')).toHaveText('28');
  await expect(distance.locator('.v4-metric-card__value span')).toHaveText('km');
  const missing = page.locator('.v4-metric-card').filter({ has: page.getByRole('heading', { name: 'Metrica assente' }) });
  await expect(missing.locator('.v4-metric-card__value strong')).toHaveText('—');
  await expect(missing).toContainText('Non disponibile');
  await expect(page.locator('.v4-metric-card').filter({ hasText: 'Serie incompleta' })).toContainText('Parziale');
});

test('progress ring states target denominator, over-target delta, and inaccessible values safely', async ({ page }) => {
  await expect(page.getByRole('img', { name: /Target demo: 28 su 40 km, 70 percento/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Target superato: 45 su 40 km, 112,5 percento/ })).toBeVisible();
  await expect(page.getByText('Superamento: +5 km')).toBeVisible();
  const invalid = page.locator('.v4-progress-card').filter({ hasText: 'Target non valido' });
  await expect(invalid).toContainText('Il target deve essere maggiore di zero.');
  await expect(invalid.getByText(/%/)).toHaveCount(0);
  const missing = page.locator('.v4-progress-card').filter({ hasText: 'Dato mancante' });
  await expect(missing).toContainText('Progresso non disponibile');
  await expect(missing.getByText(/%/)).toHaveCount(0);
});

test('denied and evidence components expose their meaning to assistive technology', async ({ page }) => {
  await expect(page.getByRole('alert')).toContainText('Accesso negato all’archivio');
  await page.getByText('Provenienza e metodo').click();
  await expect(page.getByText('Fixture sintetica', { exact: true })).toBeVisible();
  await expect(page.getByText('Non rappresenta dati atleta')).toBeVisible();
  await page.getByText('Visualizza i valori in tabella').click();
  await expect(page.getByRole('table', { name: 'Campioni della fixture' })).toBeVisible();
});

test('theme preference switches semantic palettes and persists locally', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Attiva tema light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gch-dashboard-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Attiva tema dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('reduced motion preference minimizes animation and transition durations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const durations = await page.evaluate(() => {
    const marker = document.createElement('div');
    marker.style.animation = 'spin 5s linear infinite';
    marker.style.transition = 'all 5s';
    document.body.append(marker);
    const computed = getComputedStyle(marker);
    const result = [computed.animationDuration, computed.transitionDuration];
    marker.remove();
    return result;
  });
  expect(durations).toEqual(['1e-05s', '1e-05s']);
});

test('layout remains contained at the requested viewport widths and 200 percent zoom', async ({ page }) => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Componenti dimostrativi' })).toBeVisible();
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.keyboard.press('Tab');
  const outlineWidth = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineWidth);
  expect(outlineWidth).toBe('3px');
});
