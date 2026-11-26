import {test, expect} from '@playwright/test';

const users = {
  allowed_email: process.env.GCH_E2E_ALLOWED_EMAIL!,
  allowed_password: process.env.GCH_E2E_ALLOWED_PASSWORD!,
  denied_email: process.env.GCH_E2E_DENIED_EMAIL!,
  denied_password: process.env.GCH_E2E_DENIED_PASSWORD!,
};
if (Object.values(users).some(value => !value)) throw new Error('Missing synthetic account inputs');

test('live local Supabase login, analytics, account switch and logout', async ({page}) => {
  const apiResponses: number[] = [];
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:54321/')) apiResponses.push(response.status());
  });

  await page.goto('/');
  await page.getByLabel('Email').fill(users.allowed_email);
  await page.getByLabel('Password').fill(users.allowed_password);
  await page.getByRole('button', {name: /Accedi alla dashboard/}).click();
  await expect(page.getByRole('heading', {name: /La tua performance/})).toBeVisible();
  await expect(page.getByText('API V2', {exact: true})).toBeVisible();
  await expect(page.locator('.metric-grid')).toBeVisible();
  await expect(page.getByText('Caricamento dei dati Garmin…')).toHaveCount(0);
  await expect(page.getByText('Archivio aggiornato durante la lettura. Riprova.')).toHaveCount(0);

  for (const section of ['Training Load', 'Advanced Analytics', 'Qualità dei dati']) {
    await page.getByRole('button', {name: section}).click();
    await expect(page.getByRole('heading', {name: new RegExp(section)})).toBeVisible();
  }

  await page.getByRole('button', {name: 'Disconnetti'}).first().click();
  await expect(page.getByRole('heading', {name: 'Bentornato.'})).toBeVisible();
  await page.getByLabel('Email').fill(users.denied_email);
  await page.getByLabel('Password').fill(users.denied_password);
  await page.getByRole('button', {name: /Accedi alla dashboard/}).click();
  // Account changes preserve the selected section; this flow is still on Quality after logout.
  await expect(page.getByRole('heading', {name: /Qualità dei dati/})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Accesso negato all’archivio');
  await expect(page.locator('.metric-grid')).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', {name: 'Disconnetti'}).first().click();
  await expect(page.getByRole('heading', {name: 'Bentornato.'})).toBeVisible();

  await page.getByLabel('Email').fill(users.allowed_email);
  await page.getByLabel('Password').fill(users.allowed_password);
  await page.getByRole('button', {name: /Accedi alla dashboard/}).click();
  await expect(page.getByRole('heading', {name: /Qualità dei dati/})).toBeVisible();
  await expect(page.getByText('API V2', {exact: true})).toBeVisible();
  await expect.poll(() => apiResponses.filter(status => status >= 200 && status < 300).length).toBeGreaterThan(4);
  expect(apiResponses.every(status => status < 500)).toBeTruthy();
});
