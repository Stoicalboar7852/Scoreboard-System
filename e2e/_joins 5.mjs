import { chromium } from '@playwright/test';
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('[diag]') || m.type() === 'error') console.log('CONSOLE', m.type(), t.slice(0, 900)); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await browser.close();
