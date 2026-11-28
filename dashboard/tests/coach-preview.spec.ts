import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.join(process.cwd(), 'test-results', 'adaptive-coach');

async function openCoach(page: import('@playwright/test').Page) {
  await page.goto('/tests/v4-dashboard-preview.html');
  const desktopItem = page.locator('.v4-sidebar [data-nav-id="coach"]');
  const mobileItem = page.locator('.v4-bottom-navigation [data-nav-id="coach"]');
  if (await desktopItem.isVisible().catch(() => false)) {
    await desktopItem.click();
  } else if (await mobileItem.isVisible().catch(() => false)) {
    await mobileItem.click();
  } else {
    const desktopMore = page.locator('.v4-sidebar .v4-more-trigger');
    if (await desktopMore.isVisible().catch(() => false)) {
      await desktopMore.click();
      await desktopItem.click();
    } else {
    const more = page.locator('.v4-mobile-more');
    await more.click();
    await page.locator('.v4-mobile-secondary-menu [data-nav-id="coach"]').click();
    }
  }
  await expect(page.getByRole('main', { name: 'Coach · Analisi e adattamento' })).toBeVisible();
}

test.beforeAll(async () => fs.mkdir(output, { recursive: true }));

test('offline Coach workspace renders maintain, modify and abstain scenarios with explicit synthetic decisions', async ({ page, isMobile }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    const host = new URL(request.url()).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host)) externalRequests.push(host);
  });
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await openCoach(page);
  await expect(page.getByText('Preview offline · dati sintetici')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nessuna modifica consigliata' })).toBeVisible();
  await expect(page.getByText(/attività collegate esplicitamente/i)).toBeVisible();

  if (!isMobile) await page.screenshot({ path: path.join(output, 'coach-maintain-desktop-1440x900.png'), fullPage: false, animations: 'disabled' });
  await page.getByRole('button', { name: 'Accetta · simulazione' }).click();
  await expect(page.getByRole('status')).toContainText('Piano invariato');

  await page.getByLabel('Scenario sintetico').selectOption('modify');
  await expect(page.getByRole('heading', { name: 'Rivedere una seduta futura' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prima e dopo della seduta' })).toContainText('PRIMA');
  await expect(page.getByRole('region', { name: 'Prima e dopo della seduta' })).toContainText('DOPO · PROPOSTA');
  await expect(page.getByRole('region', { name: 'Prima e dopo della seduta' })).toContainText('hard');
  await expect(page.getByRole('region', { name: 'Prima e dopo della seduta' })).toContainText('easy');
  if (!isMobile) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'coach-modify-desktop-1440x900.png'), fullPage: false, animations: 'disabled' });
  }

  await page.getByLabel('Scenario sintetico').selectOption('abstain');
  await expect(page.getByRole('heading', { name: 'Copertura insufficiente per valutare il piano' })).toBeVisible();
  await expect(page.getByRole('article').getByText(/non viene classificata come saltata/i)).toBeVisible();
  if (isMobile) await page.screenshot({ path: path.join(output, 'coach-abstain-mobile-390x844.png'), fullPage: false, animations: 'disabled' });

  expect(externalRequests).toEqual([]);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
});
