import { expect, test } from '@playwright/test';
import path from 'node:path';

const output = path.join(process.cwd(), 'test-results', 'v4-visual-preview');
const forbiddenHosts = ['supabase.co', 'garmin.com', 'garminconnect.com'];

async function assertOfflineAndComplete(page: import('@playwright/test').Page) {
  await page.goto('/tests/v4-dashboard-preview.html');
  await expect(page.getByRole('heading', { name: 'La tua performance.' })).toBeVisible();
  await expect(page.getByText(/tutti i valori sono sintetici/i)).toBeVisible();
  await expect(page.locator('#v4-volume-title')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Settimana registrata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Performance osservata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recovery signals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attività recenti' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copertura dei dati' })).toBeVisible();
  const hosts = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => {
    try { return new URL(entry.name).hostname; } catch { return ''; }
  }));
  expect(hosts.some(host => forbiddenHosts.some(forbidden => host === forbidden || host.endsWith(`.${forbidden}`)))).toBe(false);
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page, `horizontal overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport);
}

test('preview sintetica: desktop, desktop largo e tablet; screenshot viewport e pagina completa', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Le viewport desktop/tablet sono nel progetto desktop.');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    await assertOfflineAndComplete(page);
    const name = `${viewport.width}x${viewport.height}`;
    await page.screenshot({ path: path.join(output, `home-${name}.png`), fullPage: false, animations: 'disabled' });
    await page.screenshot({ path: path.join(output, `home-${name}-full.png`), fullPage: true, animations: 'disabled' });
    if (viewport.width === 1440) {
      await page.locator('.v4-theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.screenshot({ path: path.join(output, 'home-1440x900-light.png'), fullPage: false, animations: 'disabled' });
      await page.locator('.v4-theme-toggle').click();
    }
  }
  await page.setViewportSize({ width: 720, height: 450 });
  await assertOfflineAndComplete(page);
});

test('preview sintetica: mobile, navigazione touch e nessun overflow globale', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'La viewport touch è nel progetto mobile.');
  await page.setViewportSize({ width: 390, height: 844 });
  await assertOfflineAndComplete(page);
  await page.screenshot({ path: path.join(output, 'home-390x844.png'), fullPage: false, animations: 'disabled' });
  await page.screenshot({ path: path.join(output, 'home-390x844-full.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Performance' }).click();
  await expect(page.getByRole('heading', { name: 'Performance · anteprima' })).toBeVisible();
  await page.getByRole('button', { name: 'Torna alla Home' }).click();
  await expect(page.getByRole('heading', { name: 'La tua performance.' })).toBeVisible();
});
