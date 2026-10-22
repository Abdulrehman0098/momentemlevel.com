// Screenshot the V5 app tabs for a visual review.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/src/momentum-site';
const PORT = 8851;
const OUT = process.env.OUT_DIR || 'D:/src/momentum-site/.build/shots';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  fs.readFile(path.resolve(ROOT, rel), (err, buf) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto('http://127.0.0.1:' + PORT + '/app.html', { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  for (const tab of ['habits', 'legends', 'character', 'boss', 'achievements', 'calendar', 'analytics', 'settings', 'leaderboard']) {
    await page.click('.tab-btn[data-tab="' + tab + '"]');
    await page.waitForTimeout(tab === 'analytics' || tab === 'character' ? 1200 : 700);
    await page.screenshot({ path: path.join(OUT, 'app-' + tab + '.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.tab-btn[data-tab="habits"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'app-phone.png') });
  await browser.close();
  srv.close();
  console.log('shots written to ' + OUT);
})().catch((e) => { console.error('ERR', e); process.exit(2); });
