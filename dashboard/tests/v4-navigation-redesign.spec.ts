import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.join(process.cwd(), 'test-results', 'v4-navigation-redesign');
const previewPath = '/tests/v4-dashboard-preview.html';

async function assertNoGlobalOverflow(page: import('@playwright/test').Page) {
  const size = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(size.content, `Global horizontal overflow: ${JSON.stringify(size)}`).toBeLessThanOrEqual(size.viewport);
}

async function waitForPreviewCharts(page: import('@playwright/test').Page) {
  await expect(page.locator('.v4-dashboard-volume .recharts-rectangle').first()).toBeVisible();
}

test.beforeAll(async () => fs.mkdir(output, { recursive: true }));

test('desktop/tablet: sections, collapsed preference, keyboard and constrained heights', async ({ page, isMobile }) => {
  test.skip(isMobile, 'La navigazione desktop e tablet è verificata nel progetto desktop.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await waitForPreviewCharts(page);
  await page.screenshot({ path: path.join(output, 'desktop-1440x900.png'), fullPage: false, animations: 'disabled' });

  const sidebar = page.locator('.v4-sidebar');
  const initialWidth = await sidebar.evaluate(element => element.getBoundingClientRect().width);
  expect(initialWidth).toBeGreaterThanOrEqual(230);
  await page.getByRole('button', { name: 'Riduci navigazione' }).click();
  await expect(page.getByRole('button', { name: 'Espandi navigazione' })).toBeVisible();
  expect(await sidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(100);
  expect(await page.evaluate(() => localStorage.getItem('gch-v4-sidebar-collapsed'))).toBe('true');
  await page.reload();
  expect(await sidebar.evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(100);
  await page.getByRole('button', { name: 'Espandi navigazione' }).click();

  await page.getByRole('button', { name: 'Apri altre sezioni' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Goal Center', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Apri altre sezioni' })).toBeFocused();
  await page.getByRole('button', { name: 'Apri altre sezioni' }).click();
  for (const section of ['Obiettivi', 'Goal Center', 'Progresso settimanale', 'Performance Lab', 'Attività', 'Training Load', 'Sonno']) {
    await expect(page.getByRole('button', { name: section, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Goal Center', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Goal Center' })).toBeVisible();

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 768, height: 1024 }, { width: 720, height: 450 }]) {
    await page.setViewportSize(viewport);
    await page.goto(previewPath);
    await waitForPreviewCharts(page);
    await assertNoGlobalOverflow(page);
    if (viewport.width === 1920) await page.screenshot({ path: path.join(output, 'desktop-1920x1080.png'), fullPage: false, animations: 'disabled' });
    if (viewport.width === 768) {
      await page.screenshot({ path: path.join(output, 'tablet-768x1024.png'), fullPage: false, animations: 'disabled' });
      await page.getByRole('button', { name: 'Espandi navigazione' }).click();
      await expect(page.getByRole('button', { name: 'Riduci navigazione' })).toBeVisible();
      await page.locator('.v4-brand').focus();
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByRole('button', { name: 'Apri altre sezioni' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Garmin Coaching Hub, vai al contenuto' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Riduci navigazione' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Espandi navigazione' })).toBeFocused();
    }
    if (viewport.width === 720) {
      await page.screenshot({ path: path.join(output, 'viewport-zoom-200-equivalent-720x450.png'), fullPage: false, animations: 'disabled' });
      await page.getByRole('button', { name: 'Apri altre sezioni' }).click();
      await expect(page.getByRole('button', { name: 'Performance Lab', exact: true })).toBeVisible();
    }
  }
});

test('mobile portrait/landscape: bottom navigation, secondary menu, focus and safe content area', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'La navigazione touch è verificata nel progetto mobile.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(previewPath);
  const bottomNav = page.getByRole('navigation', { name: 'Navigazione mobile' });
  await expect(bottomNav).toBeVisible();
  await waitForPreviewCharts(page);
  await page.screenshot({ path: path.join(output, 'mobile-390x844.png'), fullPage: false, animations: 'disabled' });
  await assertNoGlobalOverflow(page);

  const more = page.getByRole('button', { name: 'Apri altre sezioni' });
  await more.click();
  const dialog = page.getByRole('dialog', { name: 'Altre sezioni' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Obiettivi', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Apri altre sezioni' })).toBeFocused();

  await page.getByRole('button', { name: 'Apri altre sezioni' }).click();
  await page.getByRole('button', { name: 'Goal Center', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Goal Center' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Altre sezioni' })).toHaveCount(0);
  const safePadding = await page.locator('.v4-main > .v4-preview-content').evaluate(element => Number.parseFloat(getComputedStyle(element).paddingBottom));
  const navHeight = await bottomNav.evaluate(element => element.getBoundingClientRect().height);
  expect(safePadding).toBeGreaterThanOrEqual(navHeight);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(previewPath);
  await waitForPreviewCharts(page);
  await assertNoGlobalOverflow(page);
  await page.screenshot({ path: path.join(output, 'mobile-landscape-844x390.png'), fullPage: false, animations: 'disabled' });
  await page.getByRole('button', { name: 'Apri altre sezioni' }).click();
  await expect(page.getByRole('dialog', { name: 'Altre sezioni' })).toBeVisible();
});
