import { chromium } from '@playwright/test';
const [url] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (e) => {
    console.log('CSPV', JSON.stringify({ directive: e.violatedDirective, blocked: e.blockedURI, src: e.sourceFile, line: e.lineNumber, sample: e.sample }));
  });
});
page.on('console', (m) => { const t = m.text(); if (t.startsWith('CSPV') || m.type() === 'error' || m.type() === 'warning') console.log(m.type(), t.slice(0, 400)); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log('sw', await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? 'active' : 'registered') : 'none'; }));
console.log('manifest', await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return 'no link'; const r = await fetch(l.href); const j = await r.json(); return `${r.status} ${j.name} display=${j.display} icons=${j.icons?.length}`; }));
await browser.close();
