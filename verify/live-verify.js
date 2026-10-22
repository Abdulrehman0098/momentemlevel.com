// Live-site verification against the deployed domain.
const { chromium } = require('playwright-core');
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.LIVE_BASE || 'https://momentemlevel.com';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  [' + detail + ']'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  for (const vp of [{ n: 'mobile-375', w: 375, h: 812, m: true }, { n: 'desktop-1280', w: 1280, h: 900, m: false }]) {
    console.log('\n##### ' + BASE + ' @ ' + vp.n + ' #####');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2, isMobile: vp.m, hasTouch: vp.m });
    const page = await ctx.newPage();
    const bad = [];
    // Cloudflare injects its analytics beacon at the edge; the site's CSP
    // (unchanged by this work) does not allow it, so it is blocked on every
    // page including the pre-existing build. Ignore that known injection.
    const isCfBeacon = (u) => /cloudflareinsights\.com/.test(u);
    page.on('requestfailed', r => { if (!isCfBeacon(r.url())) bad.push(r.url().replace(BASE, '') + ' :: ' + (r.failure() || {}).errorText); });
    page.on('response', r => { if (r.status() >= 400 && !isCfBeacon(r.url())) bad.push(r.status() + ' ' + r.url().replace(BASE, '')); });
    page.on('pageerror', e => bad.push('js: ' + e));

    await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2000);

    const logo = await page.evaluate(() => {
      const img = document.querySelector('header img[src*="icon.svg"]');
      if (!img) return { found: false };
      const r = img.getBoundingClientRect();
      return { found: true, nw: img.naturalWidth, w: Math.round(r.width), h: Math.round(r.height) };
    });
    check(vp.n + ': header logo renders on LIVE site', logo.found && logo.nw > 0 && logo.w > 0,
          'natural=' + logo.nw + ' box=' + logo.w + 'x' + logo.h);

    const ov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    check(vp.n + ': no horizontal overflow', ov.s <= ov.c + 1, 'scrollW=' + ov.s + ' clientW=' + ov.c);

    const nav = await page.evaluate(() => {
      const nav = document.querySelector('.site-nav nav');
      const brand = document.querySelector('.site-nav a[href="#top"]');
      if (!nav || !brand) return { ok: false };
      const br = brand.getBoundingClientRect();
      const links = [...nav.querySelectorAll('a')];
      const overlap = links.some(a => {
        const r = a.getBoundingClientRect();
        return r.width > 0 && !(r.right <= br.left || r.left >= br.right || r.bottom <= br.top || r.top >= br.bottom);
      });
      const visible = links.filter(a => a.getBoundingClientRect().width > 0).length;
      return { ok: !overlap, visible, total: links.length };
    });
    check(vp.n + ': nav visible (' + nav.visible + '/' + nav.total + ') and clear of the brand', nav.ok);

    const hero = await page.evaluate(() => {
      const w = document.querySelector('.hero-main-wrap');
      return w ? Math.round(w.getBoundingClientRect().width) : 0;
    });
    const expect = vp.w < 640 ? 140 : 190;
    check(vp.n + ': hero avatar ' + expect + 'px', Math.abs(hero - expect) <= 1, 'got ' + hero);

    check(vp.n + ': no 4xx/failed requests, no JS errors', bad.length === 0, bad.slice(0, 4).join(' | '));

    await page.screenshot({ path: 'D:/src/momentum-site/verify/live/live-' + vp.n + '.png' });
    await ctx.close();
  }

  // app.html live
  console.log('\n##### ' + BASE + '/app.html #####');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  page.on('pageerror', e => bad.push('js: ' + e));
  await page.goto(BASE + '/app.html', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2000);
  const alogo = await page.evaluate(() => {
    const img = document.querySelector('header img[src*="icon.svg"]');
    return img ? { nw: img.naturalWidth, w: Math.round(img.getBoundingClientRect().width) } : { nw: 0 };
  });
  check('app.html: header logo renders on LIVE site', alogo.nw > 0 && alogo.w > 0, 'natural=' + alogo.nw + ' box=' + alogo.w);
  const aov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  check('app.html: no horizontal overflow', aov.s <= aov.c + 1, 'scrollW=' + aov.s + ' clientW=' + aov.c);
  check('app.html: no 4xx, no JS errors', bad.length === 0, bad.slice(0, 3).join(' | '));
  await ctx.close();

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + '='.repeat(60));
  console.log('LIVE: ' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (failed.length) { failed.forEach(f => console.log('  FAIL ' + f.name)); process.exit(1); }
  console.log('ALL LIVE CHECKS PASSED');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
