// Check for elements clipped outside the viewport on the live mobile site.
const { chromium } = require('playwright-core');
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.LIVE_BASE || 'https://momentemlevel.com';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2000);

  const report = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = { viewport: W, clipped: [], header: [] };
    // Walk every element in the header + hero; flag anything crossing the edges.
    const roots = [document.querySelector('header'), ...document.querySelectorAll('section')].filter(Boolean);
    const seen = new Set();
    for (const root of roots) {
      for (const el of root.querySelectorAll('*')) {
        if (seen.has(el)) continue; seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const leftOver = -r.left;
        const rightOver = r.right - W;
        if (leftOver > 1 || rightOver > 1) {
          out.clipped.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 40),
            text: (el.textContent || '').trim().slice(0, 20),
            left: Math.round(r.left), right: Math.round(r.right),
            leftOver: Math.round(leftOver), rightOver: Math.round(rightOver),
          });
        }
      }
    }
    // Header geometry
    const h = document.querySelector('header');
    const img = document.querySelector('header img[src*="icon.svg"]');
    const nav = document.querySelector('header nav');
    const brand = document.querySelector('header a[href="#top"]');
    if (img) { const r = img.getBoundingClientRect(); out.header.push({ what: 'logo', left: Math.round(r.left), right: Math.round(r.right) }); }
    if (brand) { const r = brand.getBoundingClientRect(); out.header.push({ what: 'brand', left: Math.round(r.left), right: Math.round(r.right) }); }
    if (nav) { const r = nav.getBoundingClientRect(); out.header.push({ what: 'nav', left: Math.round(r.left), right: Math.round(r.right) }); }
    return out;
  });

  console.log('viewport width: ' + report.viewport);
  console.log('header geometry: ' + JSON.stringify(report.header));
  if (report.clipped.length === 0) {
    console.log('RESULT: no element crosses the left/right viewport edge');
  } else {
    console.log('RESULT: ' + report.clipped.length + ' element(s) cross the edge:');
    report.clipped.forEach(c => console.log('  ' + JSON.stringify(c)));
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
