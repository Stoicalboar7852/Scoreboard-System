import { chromium } from '@playwright/test';
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.text().includes('[diag]')) console.log(m.text().slice(0, 400)); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await browser.close();
