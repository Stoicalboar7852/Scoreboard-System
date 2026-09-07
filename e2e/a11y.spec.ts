import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, enterPin, startTonight } from './helpers.js';

/** §11 accessibility audit: no serious/critical axe violations on each surface. */
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious,
    `${label}: ${serious.map((v) => `${v.id} (${v.nodes.length})`).join(', ')}`,
  ).toEqual([]);
}

test('public, scoreboard, controller and admin pages have no serious accessibility violations', async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const base = baseURL as string;
  const night = await startTonight(request, base);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${base}/ladders`);
    await page.waitForSelector('[data-public-ladders]');
    await audit(page, 'public ladders');
    await page.goto(`${base}/tonight`);
    await page.waitForSelector('[data-public-tonight]');
    await audit(page, 'tonight');
    await page.goto(`${base}/scoreboard/${night.court.courtId}`);
    await page.waitForSelector('[data-scoreboard]');
    await audit(page, 'scoreboard');
    await page.goto(`${base}/controller`);
    await audit(page, 'controller PIN gate');
    await enterPin(page);
    await page.getByRole('button', { name: night.court.courtName, exact: true }).click();
    await page.waitForSelector('[data-controller]');
    await audit(page, 'controller');
    await page.goto(`${base}/login`);
    await audit(page, 'login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForSelector('[data-admin-live]');
    await audit(page, 'admin live');
    await page.goto(`${base}/admin/competitions`);
    await page.waitForSelector('table');
    await audit(page, 'admin competitions');
    await context.close();
  } finally {
    await night.admin.emit('session:end', { sessionId: night.sessionId });
    night.admin.close();
  }
});
