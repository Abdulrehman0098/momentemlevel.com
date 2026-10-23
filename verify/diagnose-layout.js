// Diagnostic probe: run this on the page you are actually looking at, then paste
// the JSON back. It reports the viewport the browser really used (CSS px), the
// size of the avatar / demo / app columns, and anything overflowing the
// viewport. That is what distinguishes a real layout bug from a zoom/scaling
// artifact. Read-only: it changes nothing.
//
//   node diagnose-layout.js            # defaults to ./index.html
//   node diagnose-layout.js app.html
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = process.argv[2] || 'index.html';
const PORT = 8877;
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  fs.readFile(path.resolve(ROOT, rel), (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise((r) => srv.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  const report = await page.evaluate(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        cssW: Math.round(b.width), cssH: Math.round(b.height),
        left: Math.round(b.left), right: Math.round(b.right),
        maxWidth: cs.maxWidth, maxHeight: cs.maxHeight,
        aspectRatio: cs.aspectRatio, width: cs.width, height: cs.height,
      };
    };
    let worst = null;
    document.querySelectorAll('body *').forEach((el) => {
      if (getComputedStyle(el).position === 'fixed') return;
      const b = el.getBoundingClientRect();
      if (b.width > document.documentElement.clientWidth + 1 && (!worst || b.width > worst.w)) {
        worst = { w: Math.round(b.width), sel: el.tagName + '.' + String(el.className || '').slice(0, 60) };
      }
    });
    const doc = document.documentElement;
    return {
      /* the numbers that explain a screenshot that "looks exploded" */
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportScale: window.visualViewport ? window.visualViewport.scale : null,
      documentClientWidth: doc.clientWidth,
      documentScrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      horizontalOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
      viewportMeta: (document.querySelector('meta[name="viewport"]') || {}).content || null,
      /* layout of the pieces the directive targets */
      heroWrap: q('.hero-main-wrap'),
      heroImg: q('.hero-avatar-img'),
      heroMini: q('#heroMini'),
      demoWrap: q('.demo-frame-wrap'),
      demoFrame: q('#demoFrame'),
      demoTransform: getComputedStyle(document.querySelector('#demoFrame') || document.body).transform,
      main: q('main'),
      hudInner: q('#hud > div'),
      navTabs: q('.nav-tabs-container'),
      appMain: q('#main-content'),
      widestOverflowingElement: worst,
    };
  });

  console.log('PAGE: ' + PAGE);
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  srv.close();
})().catch((e) => { console.error('FAILED TO RUN:', e.message); process.exit(1); });
