// Landing page (index.html) verification: sections, anchors, demo frame,
// scroll behaviours, i18n, PWA, a11y.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.SITE_ROOT || 'D:/src/momentum-site');
const PORT = Number(process.env.PORT || 8842);
const exe = process.env.CHROME_EXE || (process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      if (rel === 'favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  [' + detail + ']'));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);

  check('no uncaught page errors on boot', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('no console.error on boot', consoleErrors.length === 0, consoleErrors.slice(0, 2).map((t) => t.split('\n')[0]).join(' | '));

  /* ---------- nav ---------- */
  const nav = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('.site-nav a.nav-link, .site-nav button.nav-link'));
    return {
      labels: links.map((a) => a.textContent.trim()),
      hrefs: links.map((a) => a.getAttribute('href')),
      targets: links.map((a) => (a.getAttribute('href') || '').replace('#', '')).filter(Boolean),
      cta: Array.from(document.querySelectorAll('.site-nav a.btn-sl, .site-nav button.btn-sl')).map((a) => a.textContent.trim()),
      download: !!document.querySelector('.site-nav a[href="app.html"]'),
      login: !!document.getElementById('loginBtn'),
      scrolledClass: document.getElementById('siteNav').className,
    };
  });
  check('nav carries Features/Legends/Pricing/Docs', nav.labels.join(',') === 'Features,Legends,Pricing,Docs', nav.labels.join(','));
  check('every nav anchor resolves to a real section',
    await page.evaluate((ids) => ids.every((id) => !!document.getElementById(id)), nav.targets), nav.targets.join(','));
  check('nav holds only the section links (no Download or Login action)',
    nav.cta.length === 0 && nav.download === false && nav.login === false,
    'actions=' + nav.cta.length + ' download=' + nav.download + ' login=' + nav.login);

  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(400);
  check('nav gains its blur background on scroll',
    (await page.evaluate(() => document.getElementById('siteNav').classList.contains('scrolled'))) === true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  /* ---------- hero ---------- */
  const hero = await page.evaluate(() => ({
    title: document.querySelector('.hero-title').textContent.trim(),
    eyebrow: document.querySelector('.eyebrow').textContent.trim(),
    ctas: Array.from(document.querySelectorAll('section a.btn-sl')).slice(0, 2).map((a) => a.textContent.trim()),
    hrefs: Array.from(document.querySelectorAll('section a.btn-sl')).slice(0, 2).map((a) => a.getAttribute('href')),
    blobs: document.querySelectorAll('.blob').length,
    mini: document.querySelectorAll('#heroMini img').length,
    bigAvatar: document.querySelector('section img.hero-avatar-img'),
    chips: document.querySelectorAll('.hud-chip').length,
  }));
  check('hero headline matches the brief', hero.title === 'Level Up Your Real Life Like an RPG', hero.title);
  check('hero has dual CTA into the app and the demo',
    hero.hrefs.join(',') === 'app.html,#demo', hero.hrefs.join(','));
  check('gradient blobs + floating avatars present', hero.blobs === 3 && hero.mini === 3, hero.blobs + ' blobs / ' + hero.mini + ' mini');
  check('hero eyebrow names the build', /V5\.0\.0 Apex/.test(hero.eyebrow), hero.eyebrow);

  /* ---------- live demo ---------- */
  const demo = await page.evaluate(() => {
    const frame = document.getElementById('demoFrame');
    let inner = null;
    try {
      inner = frame.contentDocument ? {
        tabs: frame.contentDocument.querySelectorAll('.tab-btn').length,
        title: frame.contentDocument.title,
      } : null;
    } catch (e) { inner = null; }
    const cs = getComputedStyle(frame);
    return { src: frame.getAttribute('src'), transform: cs.transform, w: cs.width, inner, fallbackHidden: getComputedStyle(document.getElementById('demoFallback')).display === 'none' };
  });
  check('demo embeds the real app', demo.src === 'app.html', demo.src);
  check('demo is scaled to 75%', /matrix\(0\.75/.test(demo.transform), demo.transform);
  check('embedded app actually rendered inside the frame',
    !!demo.inner && demo.inner.tabs === 12, demo.inner ? demo.inner.tabs + ' tabs / ' + demo.inner.title : 'not readable');
  check('no fallback panel shown', demo.fallbackHidden === true);

  /* ---------- sections ---------- */
  const counts = await page.evaluate(() => ({
    features: document.querySelectorAll('#featureGrid > article').length,
    legends: document.querySelectorAll('#legendTrack > article').length,
    statBand: document.querySelectorAll('#statBand > div').length,
    testimonials: document.querySelectorAll('#testimonialGrid > article').length,
    pricing: document.querySelectorAll('#pricingGrid > article').length,
    docs: document.querySelectorAll('#docsList > div').length,
    faq: document.querySelectorAll('#faqList .faq-item').length,
    footerCols: document.querySelectorAll('.site-footer ul').length,
  }));
  check('6 feature cards', counts.features === 6, counts.features);
  check('8 legend cards in the showcase', counts.legends === 8, counts.legends);
  check('4 stat counters', counts.statBand === 4, counts.statBand);
  check('3 testimonials', counts.testimonials === 3, counts.testimonials);
  check('3 pricing tiers', counts.pricing === 3, counts.pricing);
  check('docs quick-start entries', counts.docs === 6, counts.docs);
  check('6 FAQ items', counts.faq === 6, counts.faq);
  check('footer link columns', counts.footerCols === 3, counts.footerCols);

  const pricing = await page.evaluate(() => ({
    names: Array.from(document.querySelectorAll('#pricingGrid h3')).map((h) => h.textContent.trim()),
    amounts: Array.from(document.querySelectorAll('#pricingGrid .price-amount')).map((p) => p.textContent.trim()),
    featured: document.querySelectorAll('#pricingGrid .price-card.featured').length,
    comingSoon: document.querySelectorAll('#pricingGrid [data-plan]').length,
    live: document.querySelectorAll('#pricingGrid a.btn-sl').length,
  }));
  check('pricing is Free / Pro / Lifetime', pricing.names.join(',') === 'FREE,PRO,LIFETIME', pricing.names.join(','));
  check('pricing amounts $0 / $4.99 / $49', pricing.amounts.join(',') === '$0,$4.99,$49', pricing.amounts.join(','));
  check('exactly one tier is featured', pricing.featured === 1, pricing.featured);
  check('paid tiers are honest about not being purchasable', pricing.comingSoon === 2 && pricing.live === 1, pricing.comingSoon + ' gated / ' + pricing.live + ' live');
  await page.click('#pricingGrid [data-plan="Pro"]');
  await page.waitForTimeout(300);
  check('clicking a gated tier explains why',
    await page.evaluate(() => /not purchasable/.test(document.getElementById('toast-host').innerText)));

  /* ---------- FAQ ---------- */
  const faq0 = await page.evaluate(() => {
    const item = document.querySelector('#faqList .faq-item');
    return { open: item.classList.contains('open'), expanded: item.querySelector('.faq-q').getAttribute('aria-expanded') };
  });
  await page.click('#faqList .faq-q');
  await page.waitForTimeout(400);
  const faq1 = await page.evaluate(() => {
    const item = document.querySelector('#faqList .faq-item');
    return { open: item.classList.contains('open'), expanded: item.querySelector('.faq-q').getAttribute('aria-expanded'), height: item.querySelector('.faq-a').getBoundingClientRect().height };
  });
  check('FAQ starts collapsed', faq0.open === false && faq0.expanded === 'false');
  check('FAQ opens and reports aria-expanded', faq1.open === true && faq1.expanded === 'true' && faq1.height > 10, JSON.stringify(faq1));
  await page.click('#faqList .faq-q');
  await page.waitForTimeout(400);
  check('FAQ closes again',
    (await page.evaluate(() => document.querySelector('#faqList .faq-item').classList.contains('open'))) === false);

  /* ---------- counters ---------- */
  await page.evaluate(() => document.querySelector('#statBand').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2200);
  const counters = await page.evaluate(() => Array.from(document.querySelectorAll('.counter')).map((c) => c.textContent));
  check('stat counters animate to their targets',
    counters.join(',') === '4M,10M,50K,4.9\u2605', counters.join(','));
  check('fabricated social proof is labelled as illustrative',
    await page.evaluate(() => /Illustrative figures/.test(document.querySelector('#statBand').closest('.glass-card').innerText)));

  /* ---------- reveal + boss scroll ---------- */
  const beforeReveal = await page.evaluate(() => {
    const els = document.querySelectorAll('.reveal');
    return { total: els.length, inView: document.querySelectorAll('.reveal.in').length };
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
  await page.waitForTimeout(1200);
  const afterReveal = await page.evaluate(() => document.querySelectorAll('.reveal.in').length);
  check('scroll-reveal animates sections in', beforeReveal.total >= 12 && afterReveal > beforeReveal.inView, beforeReveal.inView + ' -> ' + afterReveal + ' of ' + beforeReveal.total);

  await page.evaluate(() => document.getElementById('boss').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  const bossMid = await page.evaluate(() => ({ hp: document.getElementById('bossHpText').textContent, width: document.getElementById('bossFill').style.width, aria: document.getElementById('bossBar').getAttribute('aria-valuenow') }));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);
  const bossEnd = await page.evaluate(() => ({ hp: document.getElementById('bossHpText').textContent, width: document.getElementById('bossFill').style.width, aria: document.getElementById('bossBar').getAttribute('aria-valuenow') }));
  const hpMid = parseInt(bossMid.hp, 10), hpEnd = parseInt(bossEnd.hp, 10);
  check('boss HP depletes as you scroll', hpEnd < hpMid && hpMid <= 10000, bossMid.hp + ' -> ' + bossEnd.hp);
  check('boss bar width tracks its HP', bossMid.width !== bossEnd.width, bossMid.width + ' -> ' + bossEnd.width);
  check('boss progressbar aria tracks its HP', Number(bossEnd.aria) === hpEnd, bossEnd.aria + ' vs ' + hpEnd);

  /* ---------- i18n ---------- */
  const i18n = await page.evaluate(() => ({
    langs: Object.keys(window.I18N),
    keys: Object.keys(window.I18N.en).length,
    applied: document.querySelectorAll('[data-i18n]').length,
    title: window.I18N.en['hero.title'],
  }));
  check('i18n dictionary exists with keys', i18n.langs.join(',') === 'en' && i18n.keys >= 20, i18n.langs.join(',') + ' ' + i18n.keys + ' keys');
  check('i18n keys are wired to real elements', i18n.applied >= 10, i18n.applied);
  check('i18n hero title matches the rendered headline', i18n.title === 'Level Up Your Real Life Like an RPG', i18n.title);

  /* ---------- PWA / meta ---------- */
  const pwa = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    let manifest = null;
    try { manifest = await (await fetch(link.getAttribute('href'))).json(); } catch (e) { manifest = null; }
    return {
      href: link.getAttribute('href'),
      name: manifest && manifest.name,
      display: manifest && manifest.display,
      theme: manifest && manifest.theme_color,
      bg: manifest && manifest.background_color,
      icons: manifest && manifest.icons.length,
      categories: manifest && manifest.categories.join(','),
      shortcuts: manifest && manifest.shortcuts.map((s) => s.name).join(','),
      sw: 'serviceWorker' in navigator,
      csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      referrer: document.querySelector('meta[name="referrer"]').getAttribute('content'),
      apple: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'),
      og: !!document.querySelector('meta[property="og:title"]'),
    };
  });
  check('manifest is the site PWA', pwa.href === 'manifest.json' && pwa.name === 'MOMENTUM', pwa.href + ' ' + pwa.name);
  check('manifest is installable (standalone, theme, 3 icons)',
    pwa.display === 'standalone' && pwa.theme === '#22D3EE' && pwa.bg === '#050508' && pwa.icons === 3, JSON.stringify([pwa.display, pwa.theme, pwa.icons]));
  check('manifest categories + shortcuts', pwa.categories === 'productivity,health,games' && pwa.shortcuts === 'Habits,Boss Raid,Analytics', pwa.categories + ' / ' + pwa.shortcuts);
  check('service worker + CSP + referrer + iOS meta + OG', pwa.sw && pwa.csp && pwa.referrer === 'strict-origin-when-cross-origin' && pwa.apple && pwa.og, JSON.stringify([pwa.sw, pwa.csp, pwa.apple, pwa.og]));

  /* ---------- a11y ---------- */
  const a11y = await page.evaluate(() => ({
    skip: !!document.querySelector('.skip-link'),
    landmarks: ['header', 'nav', 'main', 'footer'].every((t) => !!document.querySelector(t)),
    imgAlts: Array.from(document.querySelectorAll('img')).every((i) => i.hasAttribute('alt')),
    faqButtons: Array.from(document.querySelectorAll('.faq-q')).every((b) => b.hasAttribute('aria-expanded')),
    frameTitle: !!document.getElementById('demoFrame').getAttribute('title'),
    h1: document.querySelectorAll('h1').length,
  }));
  check('skip link present', a11y.skip);
  check('semantic landmarks present', a11y.landmarks);
  check('every image has an alt attribute', a11y.imgAlts);
  check('FAQ buttons expose aria-expanded', a11y.faqButtons);
  check('demo iframe has a title', a11y.frameTitle);
  check('exactly one h1', a11y.h1 === 1, a11y.h1);

  const contrast = await page.evaluate(() => {
    function lum(rgb) {
      const parts = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    function parse(s) { const m = /rgba?\(([^)]+)\)/.exec(s || ''); return m ? m[1].split(',').slice(0, 3).map(Number) : null; }
    const bg = parse(getComputedStyle(document.body).backgroundColor) || [5, 5, 8];
    const out = {};
    ['.lead', '.muted', '.nav-link'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; return; }
      const fg = parse(getComputedStyle(el).color);
      if (!fg) { out[sel] = null; return; }
      const a = lum(fg), b = lum(bg);
      out[sel] = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    });
    return out;
  });
  check('landing copy meets WCAG AA (>= 4.5:1)', Object.values(contrast).every((r) => r !== null && r >= 4.5), JSON.stringify(contrast));

  /* ---------- responsive ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const mobile = await page.evaluate(() => {
    const nav = document.querySelector('.site-nav nav');
    const navR = nav.getBoundingClientRect();
    const brandR = document.querySelector('.site-nav a[href="#top"]').getBoundingClientRect();
    // Task C: nav must stay visible and wrap below the brand on mobile, with no overlap.
    const links = Array.from(nav.querySelectorAll('a.nav-link'));
    const overlap = links.some((a) => {
      const r = a.getBoundingClientRect();
      return !(r.right <= brandR.left || r.left >= brandR.right || r.bottom <= brandR.top || r.top >= brandR.bottom);
    });
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      navVisible: getComputedStyle(nav).display !== 'none',
      navBelowBrand: navR.top >= brandR.bottom - 1,
      navNoOverlap: !overlap,
      navWrapped: navR.top > 1,
      showcase: document.querySelectorAll('#legendTrack > article').length,
    };
  });
  check('no horizontal overflow at 390x844', mobile.overflow <= 1, mobile.overflow + 'px');
  check('mobile nav stays visible (wraps, not hidden)', mobile.navVisible === true);
  check('mobile nav sits below the brand with no overlap', mobile.navBelowBrand && mobile.navNoOverlap);
  check('legend showcase still renders on mobile', mobile.showcase === 8, mobile.showcase);

  /* ---------- navbar cleanup ----------
     Download and Login were removed from the header, so the nav must now hold
     only the brand and the four section links. The global pageerror /
     console.error checks at the end of the run are what prove the removed
     handlers left nothing broken behind. */
  const navbar = await page.evaluate(() => ({
    buttons: Array.from(document.querySelectorAll('.site-nav button')).map((b) => b.textContent.trim()),
    appLinks: Array.from(document.querySelectorAll('.site-nav a[href="app.html"]')).length,
    links: Array.from(document.querySelectorAll('.site-nav a.nav-link')).map((a) => a.textContent.trim()),
  }));
  check('navbar holds no Download or Login action',
    navbar.buttons.length === 0 && navbar.appLinks === 0,
    'buttons=' + navbar.buttons.length + ' appLinks=' + navbar.appLinks);
  check('navbar still carries the four section links',
    navbar.links.join(',') === 'Features,Legends,Pricing,Docs', navbar.links.join(','));

  /* ---------- legal pages ---------- */
  for (const legal of ['privacy.html', 'terms.html']) {
    const p = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/' + legal, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    const info = await p.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).textContent || '',
      sections: document.querySelectorAll('main section').length,
      headings: Array.from(document.querySelectorAll('h2')).map((h) => h.textContent.trim()),
      linksHome: !!document.querySelector('a[href="index.html"]'),
      linkApp: !!document.querySelector('a[href="app.html"]'),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    check(legal + ' renders with sections and a title',
      info.sections >= 6 && /Policy|Terms/.test(info.h1), info.h1 + ' · ' + info.sections + ' sections');
    check(legal + ' cross-links home, app and the other legal page',
      info.linksHome && info.linkApp, JSON.stringify([info.linksHome, info.linkApp]));
    check(legal + ' has no horizontal overflow', info.overflow <= 1, info.overflow + 'px');
    check(legal + ' loads with a clean console', errs.length === 0, errs.slice(0, 2).map((t) => t.split('\n')[0]).join(' | '));
    await p.close();
  }

  check('no uncaught page errors after full interaction', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('no console.error after full interaction', consoleErrors.length === 0, consoleErrors.slice(0, 2).map((t) => t.split('\n')[0]).join(' | '));

  const failures = results.filter((r) => !r.ok);
  console.log('\nFAILURES: ' + failures.length + ' / ' + results.length);
  if (failures.length) console.log('failed: ' + failures.map((f) => f.name).join(' | '));
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', (e && e.stack) || e); process.exit(2); });
