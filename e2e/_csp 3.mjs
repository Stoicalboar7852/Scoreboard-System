import { chromium } from '@playwright/test';
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.log('CSPV ' + JSON.stringify({ directive: e.violatedDirective, blocked: e.blockedURI, src: e.sourceFile, line: e.lineNumber, col: e.columnNumber }));
  });
});
page.on('console', (m) => { const t = m.text(); if (t.startsWith('CSPV')) console.log(t); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await browser.close();
