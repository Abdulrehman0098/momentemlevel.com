// Mobile verification: logo render, overlap, overflow, touch targets.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/src/momentum-site';
const PORT = 8843;
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      if (rel === 'favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.resolve(ROOT, rel);
      const rootNorm = ROOT.replace(/\\/g, '/');
      if (!file.replace(/\\/g, '/').startsWith(rootNorm)) { res.writeHead(403); res.end(); return; }
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

const VIEWPORTS = [
  { name: 'iPhone-SE',   w: 375,  h: 667, mobile: true  },
  { name: 'Android-360',  w: 360,  h: 800, mobile: true  },
  { name: 'iPhone-14',   w: 390,  h: 844, mobile: true  },
  { name: 'iPad-mini',   w: 768,  h: 1024, mobile: false },
  { name: 'iPad-land',   w: 1024, h: 768, mobile: false },
  { name: 'Desktop',     w: 1280, h: 900, mobile: false },
  { name: 'TV-4K',       w: 2560, h: 1440, mobile: false },
];

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: EXE });

  for (const vp of VIEWPORTS) {
    console.log('\n########## ' + vp.name + ' (' + vp.w + 'x' + vp.h + ') ##########');
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    // --- logo renders ---
    const logo = await page.evaluate(() => {
      const img = document.querySelector('header img[src*="icon.svg"]');
      if (!img) return { found: false };
      const r = img.getBoundingClientRect();
      return { found: true, complete: img.complete, nw: img.naturalWidth, nh: img.naturalHeight,
               w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
    });
    check(vp.name + ': header logo <img> found', logo.found);
    check(vp.name + ': header logo actually rendered (naturalWidth>0)',
          logo.found && logo.complete && logo.nw > 0,
          'natural=' + logo.nw + 'x' + logo.nh + ' box=' + logo.w + 'x' + logo.h);

    // --- favicon link resolves ---
    const fav = await page.evaluate(async () => {
      const l = document.querySelector('link[rel="icon"]');
      if (!l) return { found: false };
      const r = await fetch(l.href).then(x => ({ ok: x.ok, ct: x.headers.get('content-type') })).catch(e => ({ ok: false, ct: String(e) }));
      return { found: true, href: l.href.replace(location.origin, ''), ok: r.ok, ct: r.ct };
    });
    check(vp.name + ': rel=icon resolves 200', fav.found && fav.ok, fav.href + ' -> ' + fav.ct);

    const apple = await page.evaluate(async () => {
      const l = document.querySelector('link[rel="apple-touch-icon"]');
      if (!l) return { found: false };
      const r = await fetch(l.href).then(x => x.ok).catch(() => false);
      return { found: true, href: l.href.replace(location.origin, ''), ok: r };
    });
    check(vp.name + ': apple-touch-icon resolves 200', apple.found && apple.ok, apple.href);

    // --- no horizontal overflow ---
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth,
    }));
    const noOverflow = overflow.scrollW <= overflow.clientW + 1;
    check(vp.name + ': no horizontal overflow', noOverflow,
          'scrollW=' + overflow.scrollW + ' clientW=' + overflow.clientW);

    // --- nav / logo overlap ---
    const overlap = await page.evaluate(() => {
      const img = document.querySelector('header img[src*="icon.svg"]');
      const nav = document.querySelector('header nav');
      const brand = img ? img.closest('a') : null;
      if (!img || !nav) return { skip: true };
      const ir = img.getBoundingClientRect();
      const links = [...nav.querySelectorAll('a')].map(a => {
        const r = a.getBoundingClientRect();
        return { text: a.textContent.trim(), r,
                 overlapsImg: !(r.right <= ir.left || r.left >= ir.right || r.bottom <= ir.top || r.top >= ir.bottom) };
      });
      const br = brand ? brand.getBoundingClientRect() : null;
      const linksOverlapBrand = br ? links.filter(l => !(l.r.right <= br.left || l.r.left >= br.right || l.r.bottom <= br.top || l.r.top >= br.bottom)) : [];
      const navR = nav.getBoundingClientRect();
      return {
        skip: false,
        logoBox: { l: Math.round(ir.left), r: Math.round(ir.right), t: Math.round(ir.top), b: Math.round(ir.bottom) },
        navBox: { l: Math.round(navR.left), r: Math.round(navR.right), t: Math.round(navR.top), b: Math.round(navR.bottom) },
        links: links.map(l => ({ text: l.text, overlapsImg: l.overlapsImg,
                                 box: { l: Math.round(l.r.left), r: Math.round(l.r.right), t: Math.round(l.r.top), b: Math.round(l.r.bottom) } })),
        visibleLinks: links.filter(l => l.r.width > 0 && l.r.height > 0).length,
        totalLinks: links.length,
        brandOverlap: linksOverlapBrand.map(l => l.text),
      };
    });
    if (!overlap.skip) {
      check(vp.name + ': all nav links visible', overlap.visibleLinks === overlap.totalLinks,
            overlap.visibleLinks + '/' + overlap.totalLinks);
      check(vp.name + ': nav links do NOT overlap logo', overlap.links.every(l => !l.overlapsImg),
            overlap.links.filter(l => l.overlapsImg).map(l => l.text).join(',') || 'none');
      check(vp.name + ': nav links do NOT overlap brand block', overlap.brandOverlap.length === 0,
            overlap.brandOverlap.join(',') || 'none');
      console.log('        logo box ' + JSON.stringify(overlap.logoBox) + '  nav box ' + JSON.stringify(overlap.navBox));
    }

    // --- touch targets ---
    if (vp.mobile) {
      const tt = await page.evaluate(() => {
        const sel = 'header nav a, .btn-sl, .tab-btn';
        return [...document.querySelectorAll(sel)].filter(el => el.getBoundingClientRect().height > 0)
          .map(el => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 18),
                     w: Math.round(r.width), h: Math.round(r.height) };
          });
      });
      const small = tt.filter(t => t.h < 44);
      check(vp.name + ': header/CTA touch targets >= 44px tall', small.length === 0,
            small.length ? small.map(s => s.text + '=' + s.h).join(',') : tt.length + ' targets ok');
    }

    // --- hero avatar sizing ---
    const hero = await page.evaluate(() => {
      const w = document.querySelector('.hero-main-wrap');
      if (!w) return null;
      const r = w.getBoundingClientRect();
      const img = w.querySelector('img');
      const ir = img ? img.getBoundingClientRect() : null;
      return { wrap: Math.round(r.width), img: ir ? Math.round(ir.width) : 0 };
    });
    if (hero) {
      const expect = vp.w < 640 ? 120 : 190;
      check(vp.name + ': hero avatar scaled to ' + expect + 'px', Math.abs(hero.wrap - expect) <= 1,
            'wrap=' + hero.wrap + ' img=' + hero.img);
    }

    // --- hero text not clipped / buttons reachable ---
    const heroText = await page.evaluate(() => {
      const h1 = document.querySelector('.hero-title');
      const btns = [...document.querySelectorAll('.hero-cta, a.btn-sl')].slice(0, 2);
      const out = {};
      if (h1) { const r = h1.getBoundingClientRect(); out.h1 = { w: Math.round(r.width), h: Math.round(r.height), scrollW: h1.scrollWidth, clientW: h1.clientWidth }; }
      return out;
    });
    if (heroText.h1) {
      check(vp.name + ': hero title not clipped', heroText.h1.scrollW <= heroText.h1.clientW + 2,
              'scrollW=' + heroText.h1.scrollW + ' clientW=' + heroText.h1.clientW);
    }

    // --- demo frame present and sized ---
    const demo = await page.evaluate(() => {
      const f = document.getElementById('demoFrame');
      if (!f) return null;
      const r = f.getBoundingClientRect();
      const wrap = f.closest('.demo-frame-wrap');
      const wr = wrap ? wrap.getBoundingClientRect() : null;
      return {
        w: Math.round(r.width), h: Math.round(r.height), src: f.getAttribute('src'),
        transform: getComputedStyle(f).transform,
        wrapW: wr ? Math.round(wr.width) : 0,
        wrapH: wr ? Math.round(wr.height) : 0,
      };
    });
    check(vp.name + ': live demo iframe present + sized', !!demo && demo.w > 0 && demo.h > 0,
            demo ? demo.w + 'x' + demo.h : 'missing');

    // --- Task B: iframe scaling per device ---
    if (demo) {
      if (vp.w < 768) {
        // Fluid native size: no transform, frame fills the wrapper.
        check(vp.name + ': demo iframe is fluid (no scale)', demo.transform === 'none',
                'transform=' + demo.transform);
        check(vp.name + ': demo iframe fills wrapper width', Math.abs(demo.w - demo.wrapW) <= 2,
                'frame=' + demo.w + ' wrapper=' + demo.wrapW);
        check(vp.name + ': demo wrapper height capped', demo.wrapH <= Math.round(vp.h * 0.8) + 1,
                'wrapH=' + demo.wrapH + ' 80vh=' + Math.round(vp.h * 0.8));
      } else {
        // Desktop keeps the 75% scale trick.
        check(vp.name + ': demo iframe scaled to 75%', /matrix\(0\.75/.test(demo.transform),
                demo.transform);
      }
    }

    // --- Task A.2: grid columns per breakpoint ---
    const grids = await page.evaluate(() => {
      const cols = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : -1;
      };
      return {
        feature: cols('#featureGrid'),
        pricing: cols('#pricingGrid'),
        testimonial: cols('#testimonialGrid'),
        stat: cols('#statBand'),
      };
    });
    const expect = (n, wide, mid, narrow) => vp.w >= 1024 ? wide : (vp.w >= 768 ? mid : narrow);
    check(vp.name + ': featureGrid columns=' + grids.feature, grids.feature === expect(1, 3, 2, 1),
            'want ' + expect(1, 3, 2, 1));
    check(vp.name + ': pricingGrid columns=' + grids.pricing, grids.pricing === expect(1, 3, 2, 1),
            'want ' + expect(1, 3, 2, 1));
    check(vp.name + ': testimonialGrid columns=' + grids.testimonial, grids.testimonial === expect(1, 3, 2, 1),
            'want ' + expect(1, 3, 2, 1));

    // --- Task A.3: TV / 4K must not distort or overflow ---
    if (vp.w > 1920) {
      check(vp.name + ': TV viewport has no horizontal overflow', noOverflow,
              'scrollW=' + overflow.scrollW + ' clientW=' + overflow.clientW);
      const tv = await page.evaluate(() => {
        const h1 = document.querySelector('.hero-title');
        const r = h1 ? h1.getBoundingClientRect() : null;
        return { titleW: r ? Math.round(r.width) : 0, titleScroll: h1 ? h1.scrollWidth : 0 };
      });
      check(vp.name + ': TV hero title scaled up and not clipped',
              tv.titleW > 0 && tv.titleScroll <= tv.titleW + 2,
              'w=' + tv.titleW + ' scrollW=' + tv.titleScroll);
    }

    // --- page errors ---
    check(vp.name + ': no JS/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    await page.screenshot({ path: ROOT + '/verify/shots/mobile-' + vp.name + '.png', fullPage: false });
    await ctx.close();
  }

  // ---------- app.html ----------
  console.log('\n########## app.html ##########');
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[4]]) {
    console.log('\n---- app.html @ ' + vp.name + ' ----');
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/app.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const logo = await page.evaluate(() => {
      const img = document.querySelector('header img[src*="icon.svg"]');
      if (!img) return { found: false };
      return { found: true, nw: img.naturalWidth, complete: img.complete };
    });
    check('app ' + vp.name + ': header logo renders', logo.found && logo.nw > 0, 'natural=' + logo.nw);

    const ov = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    check('app ' + vp.name + ': no horizontal overflow', ov.s <= ov.c + 1, 'scrollW=' + ov.s + ' clientW=' + ov.c);

    if (vp.mobile) {
      const tt = await page.evaluate(() => [...document.querySelectorAll('.tab-btn')].map(el => {
        const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0,10), h: Math.round(r.height) };
      }));
      const small = tt.filter(x => x.h < 44);
      check('app ' + vp.name + ': tab buttons >= 44px', small.length === 0,
            small.length ? small.map(s => s.t + '=' + s.h).join(',') : tt.length + ' tabs ok');
    }
    check('app ' + vp.name + ': no JS errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: ROOT + '/verify/shots/app-' + vp.name + '.png', fullPage: false });
    await ctx.close();
  }

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + '='.repeat(62));
  console.log('TOTAL: ' + results.length + '   PASS: ' + (results.length - failed.length) + '   FAIL: ' + failed.length);
  if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log('  - ' + f.name)); process.exit(1); }
  console.log('ALL BROWSER CHECKS PASSED');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
