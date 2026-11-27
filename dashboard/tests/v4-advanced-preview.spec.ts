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

  if (!isMobile) {
    const views = [
      ['Dashboard', 'Dashboard', 'home'],
      ['Goal Center', 'Avanzamento dei tuoi obiettivi', 'goal-center'],
      ['Performance Lab', 'Andamento VO₂max e VDOT', 'performance-lab'],
      ['Progresso settimanale', 'Target e attività osservate', 'weekly-progress'],
    ] as const;
    await page.locator('html').evaluate(element => element.setAttribute('data-theme', 'light'));
    for (const [section, heading, file] of views) {
      await page.getByRole('button', { name: section }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await page.screenshot({ path: path.join(output, `${file}-light-1440x900.png`), fullPage: true, animations: 'disabled' });
    }

    await page.locator('html').evaluate(element => element.setAttribute('data-theme', 'dark'));
    await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
    for (const [section, heading, file] of views) {
      await page.getByRole('button', { name: section }).click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(dimensions.scroll, `overflow at 200% in ${section}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.width);
      await page.screenshot({ path: path.join(output, `${file}-zoom200.png`), fullPage: false, animations: 'disabled' });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  }

  expect(externalRequests).toEqual([]);
});

test('tipografia informativa V4 almeno 12px e testo secondario WCAG AA in entrambi i temi', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tests/v4-dashboard-preview.html');
  const screens = [
    ['Dashboard', 'Dashboard'],
    ['Goal Center', 'Avanzamento dei tuoi obiettivi'],
    ['Performance Lab', 'Andamento VO₂max e VDOT'],
    ['Progresso settimanale', 'Target e attività osservate'],
  ] as const;
  const minimumFontSelectors = [
    '.v4-card-kicker', '.v4-source-pill', '.v4-demo-label', '.v4-data-state__label', '.v4-data-state__message',
    '.v4-metric-card__top h2', '.v4-metric-card__status', '.v4-metric-card__meta', '.v4-metric-card__detail',
    '.v4-dashboard-card__header h2', '.v4-dashboard-card__header p', '.v4-week-day', '.v4-week-footnote',
    '.v4-performance-rows span', '.v4-performance-rows small', '.v4-recovery-name', '.v4-recovery-count',
    '.v4-ring-item strong', '.v4-ring-item small', '.v4-multi-ring-center span', '.v4-radar-legend',
    '.v4-radar-table-wrap th', '.v4-radar-table-wrap td', '.v4-accessible-table th', '.v4-accessible-table td',
    '.v4-goal-stats span', '.v4-objective-list small', '.v4-weekly-stat',
    '.v4-performance-kpi > span', '.v4-performance-kpi > small', '.v4-zone-list', '.chart-y-label', '.chart-x-label',
    '.recharts-cartesian-axis-tick-value', '.recharts-legend-item-text',
    '.v4-goal-mini-rings small', '.v4-recovery-baseline__grid span', '.v4-recovery-baseline__grid strong',
    '.v4-recovery-baseline__grid small', '.v4-volume-table summary',
  ];

  for (const [section, heading] of screens) {
    if (section !== 'Home') await page.getByRole('button', { name: section }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    const undersized = await page.evaluate(selectors => selectors.flatMap(selector =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && parseFloat(getComputedStyle(element).fontSize) < 12;
      }).map(element => ({ selector, text: (element.textContent ?? '').trim().slice(0, 35), size: getComputedStyle(element).fontSize }))
    ), minimumFontSelectors);
    expect(undersized, `${section} has informative text below 12px`).toEqual([]);
  }

  for (const theme of ['dark', 'light']) {
    await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
    const contrast = await page.evaluate(() => {
      const root = getComputedStyle(document.querySelector('.v4-theme-root')!);
      const luminance = (color: string) => {
        const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
          const channel = value / 255;
          return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        });
        return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
      };
      const ratio = (foreground: string, background: string) => {
        const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (values[0] + .05) / (values[1] + .05);
      };
      const secondary = root.getPropertyValue('--text-secondary').trim();
      const primary = root.getPropertyValue('--text-primary').trim();
      const panel = root.getPropertyValue('--surface-panel').trim();
      const base = root.getPropertyValue('--surface-base').trim();
      const resolve = (value: string) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      return [ratio(resolve(secondary), resolve(panel)), ratio(resolve(secondary), resolve(base)), ratio(resolve(primary), resolve(panel))];
    });
    expect(contrast.every(value => value >= 4.5), `${theme} contrast ratios: ${contrast.join(', ')}`).toBeTruthy();
  }
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
