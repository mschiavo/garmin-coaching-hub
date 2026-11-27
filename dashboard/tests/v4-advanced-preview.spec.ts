import { expect, test } from '@playwright/test';
import path from 'node:path';

const output = path.join(process.cwd(), 'test-results', 'v4-advanced-preview');

test('preview offline: Home, Goal Center, Performance Lab e progresso settimanale completi', async ({ page, isMobile }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) externalRequests.push(url.hostname);
  });

  const viewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await page.goto('/tests/v4-dashboard-preview.html');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(/tutti i valori sono sintetici/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Volume di allenamento' })).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(output, `home-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Goal Center' }).click();
  await expect(page.getByRole('heading', { name: 'Avanzamento dei tuoi obiettivi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profilo attuale e obiettivo' })).toBeVisible();
  await expect(page.getByText(/dati sintetici/i).first()).toBeVisible();
  await expect(page.locator('.v4-multi-ring circle.v4-ring-value')).toHaveCount(4);
  await expect(page.locator('.v4-ring-item').first()).toContainText('86%');
  await expect(page.locator('.v4-radar-table-wrap tbody tr')).toHaveCount(6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, `goal-center-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Performance Lab' }).click();
  await expect(page.getByRole('heading', { name: 'Andamento VO₂max e VDOT' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ritmo e frequenza cardiaca' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zone di intensità' })).toBeVisible();
  await expect(page.getByText('Proiezioni gara · demo')).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(output, `performance-lab-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Progresso settimanale' }).click();
  await expect(page.getByRole('heading', { name: 'Target e attività osservate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Andamento cumulativo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Previsto vs eseguito' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scostamenti rispetto al target' })).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(output, `weekly-progress-${viewport.width}x${viewport.height}.png`), fullPage: true, animations: 'disabled' });

  expect(externalRequests).toEqual([]);
});

test('sezioni avanzate: radar e grafici restano leggibili su tablet e mobile senza overflow globale', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Viewport tablet desktop; il progetto mobile verifica la viewport touch.');
  await page.goto('/tests/v4-dashboard-preview.html');
  for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [section, heading] of [
      ['Goal Center', 'Avanzamento dei tuoi obiettivi'],
      ['Performance Lab', 'Andamento VO₂max e VDOT'],
      ['Progresso settimanale', 'Target e attività osservate'],
    ]) {
      await page.getByRole('button', { name: section }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(size.content, `overflow ${section}: ${JSON.stringify(size)}`).toBeLessThanOrEqual(size.viewport);
      if (viewport.width === 390) await page.screenshot({ path: path.join(output, `${section.toLowerCase().replaceAll(' ', '-')}-390x844.png`), fullPage: true, animations: 'disabled' });
    }
  }
});
