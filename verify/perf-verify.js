// Perf verification: measure scroll jank before vs after the refactor.
// Serves the current site and a copy of the pre-change backup, then runs a real
// CDP touch-drag scroll while recording rAF frame times and long tasks.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/src/momentum-site';
const BK = process.env.BK_DIR || (process.env.TMPDIR + '/perf_before');
const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };

function serve(root, port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      if (rel === 'favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.resolve(root, rel);
      const rootNorm = root.replace(/\\/g, '/');
      if (!file.replace(/\\/g, '/').startsWith(rootNorm)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

// Install a frame-time recorder + long-task observer before any page script runs.
const INSTRUMENT = () => {
  window.__frames = [];
  window.__longTasks = [];
  window.__recording = false;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(e.duration); })
      .observe({ entryTypes: ['longtask'] });
  } catch (e) { /* longtask unsupported */ }
  window.__startRecording = () => {
    window.__frames = [];
    window.__longTasks = [];
    window.__recording = true;
    let last = 0;
    const tick = (ts) => {
      if (!window.__recording) return;
      window.__frames.push(last ? ts - last : 16.7);
      last = ts;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__stopRecording = () => { window.__recording = false; };
};

async function measure(browser, port, label) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(INSTRUMENT);
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1500);

  // Static facts first.
  const facts = await page.evaluate(() => {
    const card = document.querySelector('.glass-card');
    const nav = document.querySelector('.site-nav');
    const cardCs = card ? getComputedStyle(card) : null;
    const navCs = nav ? getComputedStyle(nav) : null;
    return {
      cardBackdrop: cardCs ? cardCs.backdropFilter || cardCs.webkitBackdropFilter || 'none' : 'n/a',
      navBackdrop: navCs ? navCs.backdropFilter || navCs.webkitBackdropFilter || 'none' : 'n/a',
      cardWillChange: cardCs ? cardCs.willChange : 'n/a',
      scrollHeight: document.documentElement.scrollHeight,
    };
  });

  // Warm up, then do real touch drags while recording.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__startRecording());
  await page.waitForTimeout(300);

  const cx = 187, cy = 600;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= 24; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx, y: cy - i * 22, id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // Second, faster fling.
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 2 }] });
  for (let i = 1; i <= 30; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx, y: cy - i * 40, id: 2 }],
    });
    await page.waitForTimeout(12);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await page.waitForTimeout(600);
  const result = await page.evaluate(() => {
    window.__stopRecording();
    const f = window.__frames.filter((x) => x < 1000);
    const jank = f.filter((d) => d > 20).length;
    const worst = f.length ? Math.max(...f) : 0;
    const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
    /* Median and p95 are far more stable than max() in headless Chrome, where a
       single first-paint spike can dominate the worst frame. */
    const sorted = [...f].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    /* Re-read the nav now that .scrolled is applied — its blur only exists in
       that state, so measuring before the drag would miss it. */
    const nav = document.querySelector('.site-nav');
    const navCs = nav ? getComputedStyle(nav) : null;
    return {
      frames: f.length, jank, worst: Math.round(worst * 10) / 10,
      avg: Math.round(avg * 100) / 100,
      median: Math.round(median * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      longTasks: window.__longTasks.length,
      longestTask: window.__longTasks.length ? Math.round(Math.max(...window.__longTasks)) : 0,
      scrollY: Math.round(window.scrollY),
      navScrolledClass: nav ? nav.className : 'n/a',
      navBackdropScrolled: navCs ? (navCs.backdropFilter || navCs.webkitBackdropFilter || 'none') : 'n/a',
    };
  });
  await ctx.close();
  return { label, facts, ...result };
}

function row(a, b, label) {
  const fmt = (v) => String(v).padStart(9);
  console.log('  ' + label.padEnd(26) + fmt(a) + fmt(b));
}

(async () => {
  const hasBaseline = BK && fs.existsSync(BK);
  const serverAfter = await serve(ROOT, 8851);
  const serverBefore = hasBaseline ? await serve(BK, 8852) : null;
  const browser = await chromium.launch({ executablePath: EXE });

  console.log('\n=== scroll jank: 375x812, isMobile, real CDP touch drags ===');
  if (hasBaseline) console.log('  baseline: ' + BK);
  else console.log('  baseline: not found — asserting the refactored state only');
  console.log('');

  const after = await measure(browser, 8851, 'AFTER  (refactored)');
  const before = hasBaseline ? await measure(browser, 8852, 'BEFORE (pre-refactor)') : null;

  if (before) {
    console.log('  metric                    BEFORE     AFTER');
    console.log('  ' + '-'.repeat(50));
    row(before.frames, after.frames, 'frames recorded');
    row(before.jank, after.jank, 'jank frames (>20ms)');
    row(before.median, after.median, 'median frame (ms)');
    row(before.p95, after.p95, 'p95 frame (ms)');
    row(before.avg, after.avg, 'avg frame (ms)');
    row(before.worst, after.worst, 'worst frame (ms)');
    row(before.longTasks, after.longTasks, 'long tasks (>50ms)');
    row(before.longestTask, after.longestTask, 'longest task (ms)');
    console.log('  ' + '-'.repeat(50));
    console.log('  scrolled: ' + before.scrollY + 'px -> ' + after.scrollY + 'px');

    console.log('\n=== computed styles ===');
    console.log('  .glass-card backdrop-filter:   ' + before.facts.cardBackdrop + '  ->  ' + after.facts.cardBackdrop);
    console.log('  .glass-card will-change:       ' + before.facts.cardWillChange + '  ->  ' + after.facts.cardWillChange);
    console.log('  .site-nav backdrop (scrolled): ' + before.navBackdropScrolled + '  ->  ' + after.navBackdropScrolled);
  } else {
    console.log('  metric                    AFTER');
    console.log('  ' + '-'.repeat(50));
    row(after.frames, '', 'frames recorded');
    row(after.jank, '', 'jank frames (>20ms)');
    row(after.worst, '', 'worst frame (ms)');
    row(after.avg, '', 'avg frame (ms)');
    row(after.longTasks, '', 'long tasks (>50ms)');
    console.log('  ' + '-'.repeat(50));
    console.log('  scrolled: ' + after.scrollY + 'px');
    console.log('\n=== computed styles ===');
    console.log('  .glass-card backdrop-filter:   ' + after.facts.cardBackdrop);
    console.log('  .glass-card will-change:       ' + after.facts.cardWillChange);
    console.log('  .site-nav backdrop (scrolled): ' + after.navBackdropScrolled);
  }

  console.log('\n' + '='.repeat(60));
  let pass = true;
  if (after.facts.cardBackdrop === 'none') console.log('PASS  .glass-card backdrop-filter removed');
  else { pass = false; console.log('FAIL  .glass-card backdrop-filter still: ' + after.facts.cardBackdrop); }
  if (after.navBackdropScrolled === 'none') console.log('PASS  .site-nav backdrop-filter removed (scrolled state)');
  else { pass = false; console.log('FAIL  .site-nav backdrop-filter still: ' + after.navBackdropScrolled); }
  if (after.facts.cardWillChange === 'transform') console.log('PASS  .glass-card promoted to its own compositor layer');
  else { pass = false; console.log('FAIL  .glass-card will-change: ' + after.facts.cardWillChange); }
  if (after.scrollY > 0) console.log('PASS  page actually scrolled ' + after.scrollY + 'px (gesture engaged)');
  else { pass = false; console.log('FAIL  page did not scroll — gesture did not engage'); }
  if (before) {
    /* Gate on the metrics that are stable across headless runs: jank count,
       median frame time and long tasks. `worst frame` is reported but not
       gated — a single first-paint spike swings it 50-170ms on identical
       input, so it cannot distinguish a real regression from noise. */
    if (after.jank <= before.jank) console.log('PASS  jank frames ' + before.jank + ' -> ' + after.jank);
    else { pass = false; console.log('FAIL  jank frames regressed ' + before.jank + ' -> ' + after.jank); }
    if (after.median <= before.median * 1.15) console.log('PASS  median frame ' + before.median + 'ms -> ' + after.median + 'ms');
    else { pass = false; console.log('FAIL  median frame regressed ' + before.median + 'ms -> ' + after.median + 'ms'); }
    if (after.longTasks <= before.longTasks) console.log('PASS  long tasks ' + before.longTasks + ' -> ' + after.longTasks);
    else { pass = false; console.log('FAIL  long tasks regressed ' + before.longTasks + ' -> ' + after.longTasks); }
    console.log('INFO worst frame ' + before.worst + 'ms -> ' + after.worst + 'ms (noisy, not gated)');
  } else {
    console.log('NOTE  pass BK_DIR=<pre-refactor copy> to compare against the baseline');
  }
  await browser.close();
  serverAfter.close();
  if (serverBefore) serverBefore.close();
  console.log(pass ? 'PERF CHECKS PASSED' : 'PERF CHECKS FAILED');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
