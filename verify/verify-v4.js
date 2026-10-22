// V4.0.5 verification harness for momentum-site/index.html.
// Serves the site itself, then drives real Chromium over the DevTools protocol.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.SITE_ROOT || 'D:/src/momentum-site');
const PORT = Number(process.env.PORT || 8817);

const CANDIDATES = [
  process.env.CHROME_EXE,
  process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      if (rel === 'favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        });
        res.end(buf);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  const d = detail === undefined ? '' : '  [' + detail + ']';
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + d);
}

(async () => {
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no chrome binary found in: ' + CANDIDATES.join(', '));

  const server = await serve();
  const URL = 'http://127.0.0.1:' + PORT + '/index.html';
  console.log('chrome:', exe);
  console.log('url   :', URL, '\n');

  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  check('no uncaught page errors on load', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console.error on load', consoleErrors.length === 0, consoleErrors.join(' | '));

  // ---------- HUD header ----------
  const hud = await page.evaluate(() => {
    const nav = Array.from(document.querySelectorAll('nav a.hud-link')).map((a) => a.textContent.trim());
    const hrefs = Array.from(document.querySelectorAll('nav a.hud-link')).map((a) => a.getAttribute('href'));
    return {
      brand: document.querySelector('header p').innerText.replace(/\s+/g, ' ').trim(),
      nav, hrefs,
      level: document.getElementById('levelDisplay').textContent,
      rank: document.getElementById('rankDisplay').textContent,
      xp: document.getElementById('xpDisplay').textContent,
      gold: document.getElementById('goldDisplay').textContent,
      mp: document.getElementById('mpDisplay').textContent,
      xpMeter: document.getElementById('xpMeter').style.width,
    };
  });
  check('HUD shows V4.0.5 LIVE', /V4\.0\.5 LIVE/.test(hud.brand), hud.brand);
  check('HUD nav links Features/About/Docs', hud.nav.join(',') === 'Features,About,Docs', hud.nav.join(','));
  check('nav links resolve to real sections',
    hud.hrefs.join(',') === '#app,#about,#docs' &&
    (await page.evaluate(() => ['app', 'about', 'docs'].every((id) => !!document.getElementById(id)))),
    hud.hrefs.join(','));
  check('HUD level badge', hud.level === '3', hud.level);
  check('HUD rank badge', hud.rank === 'E-RANK', hud.rank);
  check('HUD XP meter text 520/550', hud.xp === '520/550', hud.xp);
  check('HUD gold 650', hud.gold === '650', hud.gold);
  check('HUD mana 100/100', hud.mp === '100/100', hud.mp);
  check('XP meter bar is filled', parseFloat(hud.xpMeter) > 90 && parseFloat(hud.xpMeter) <= 100, hud.xpMeter);

  // ---------- cinematic layers ----------
  const scanAnim = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.scanline')).animationDuration);
  check('scanline sweep runs every 8s', scanAnim === '8s', scanAnim);
  const crt = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.scanline-container'), '::before').backgroundImage);
  check('persistent CRT scanline pattern present', crt.includes('repeating-linear-gradient'), crt.slice(0, 40));

  const field = await page.evaluate(() => ({
    tag: document.getElementById('particles').tagName,
    dots: window.particleField.dots.length,
    ran: window.particleField.lastTs > 0,
  }));
  check('particle canvas running', field.tag === 'CANVAS' && field.ran && field.dots === 46, JSON.stringify(field));

  const dragon = await page.evaluate(() => {
    const el = document.querySelector('.boss-dragon');
    if (!el) return null;
    const s = getComputedStyle(el);
    return { anim: s.animationName, dur: s.animationDuration, text: el.textContent.trim() };
  });
  check('boss dragon is animated', !!dragon && dragon.anim === 'dragon-hover' && dragon.dur === '3.4s',
    JSON.stringify(dragon));

  const figures = await page.evaluate(() =>
    getComputedStyle(document.body).fontVariantNumeric);
  check('body uses tabular figures', figures.includes('tabular-nums'), figures);

  // ---------- encoding ----------
  const icons = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('momentumState')).habits.map((h) => h.icon.codePointAt(0)));
  check('seed emoji intact (3 glyphs)',
    icons.join(',') === [0x1f3c3, 0x1f4d6, 0x1f4a7].join(','),
    icons.map((c) => 'U+' + c.toString(16)).join(' '));
  check('no U+FFFD in DOM', (await page.evaluate(() => document.body.innerText.indexOf('\uFFFD'))) === -1);

  // ---------- seed content per spec ----------
  const seed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('momentumState'));
    return {
      habits: s.habits.map((h) => h.name),
      dailies: s.dailies.map((d) => d.name),
      todos: s.todos.map((t) => t.name),
      heroes: HEROES.map((h) => h.name),
      equipment: HEROES[0].equipment,
      stats: HEROES[0],
      xpByDayDays: Object.keys(s.xpByDay).length,
    };
  });
  check('seed habits match spec', seed.habits.join('|') === 'Morning Run|Read 20 Pages|Drink Water', seed.habits.join('|'));
  check('seed dailies match spec',
    seed.dailies.join('|') === 'Review daily roadmap|Read for 15 minutes|Take Vitamins|Journal 3 things',
    seed.dailies.join('|'));
  check('seed todos match spec',
    seed.todos.join('|') === 'Finish Project Report|Call Courier|Buy Groceries|Book Flight Tickets',
    seed.todos.join('|'));
  check('4 legend archetypes per spec',
    seed.heroes.join('|') === 'Shadow Monarch|Raging Berserker|Archmage|Cosmic Architect',
    seed.heroes.join('|'));
  check('equipment matches spec',
    Object.values(seed.equipment).join('|') === 'Crown of Eternity|Aegis of Void|Staff of Creation|Gauntlet of Quickening',
    Object.values(seed.equipment).join('|'));
  check('heroes carry 5 stats',
    ['str', 'agi', 'int', 'per', 'cre'].every((k) => typeof seed.stats[k] === 'number'),
    JSON.stringify({ str: seed.stats.str, agi: seed.stats.agi, int: seed.stats.int, per: seed.stats.per, cre: seed.stats.cre }));
  check('7-day XP ledger seeded', seed.xpByDayDays === 7, seed.xpByDayDays);

  // ---------- render counts ----------
  const counts = await page.evaluate(() => ({
    habits: document.querySelectorAll('#habitsList > div').length,
    dailies: document.querySelectorAll('#dailiesList > div').length,
    todos: document.querySelectorAll('#todosList > div').length,
    legends: document.querySelectorAll('#legendsGrid > div').length,
    party: document.querySelectorAll('#partyList > div').length,
  }));
  check('3 habits / 4 dailies / 4 todos rendered',
    counts.habits === 3 && counts.dailies === 4 && counts.todos === 4, JSON.stringify(counts));
  check('4 legend cards + 4 party rows', counts.legends === 4 && counts.party === 4,
    counts.legends + '/' + counts.party);

  const partyNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#partyList > div'))
      .map((d) => d.querySelector('p').textContent.trim()));
  check('party roster matches spec',
    partyNames.join('|') === 'Saiyan Warrior|Ghost of Sports|Capod Baby|Cosmic Architect',
    partyNames.join('|'));

  await page.waitForTimeout(900);
  const avatars = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img[src*="dicebear"]'))
      .map((i) => ({ seed: (/seed=([^&]+)/.exec(i.src) || [])[1], ok: i.naturalWidth > 0 })));
  const broken = avatars.filter((a) => !a.ok);
  check('all archetype avatars load', avatars.length > 0 && broken.length === 0,
    avatars.length + ' imgs, ' + broken.length + ' broken');

  // ---------- tabs ----------
  const tabs = ['habits', 'dailies', 'todos', 'legends', 'character', 'boss', 'licenses'];
  const badTabs = [];
  for (const t of tabs) {
    await page.click('.tab-btn[data-tab="' + t + '"]');
    await page.waitForTimeout(110);
    const ok = await page.evaluate((id) => {
      const p = document.getElementById('tab-' + id);
      const shown = Array.from(document.querySelectorAll('.tab-content'))
        .filter((el) => getComputedStyle(el).display !== 'none');
      return p.classList.contains('active') && shown.length === 1 && shown[0] === p;
    }, t);
    if (!ok) badTabs.push(t);
  }
  check('all 7 tabs switch panels', badTabs.length === 0, badTabs.join(',') || 'none broken');

  // ---------- charts (on the character tab, now visible) ----------
  const charts = await page.evaluate(() => {
    function lit(id) {
      const c = document.getElementById(id);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) { n++; if (n > 400) break; } }
      return n;
    }
    return {
      radar: lit('radarChart'),
      trend: lit('xpTrendChart'),
      radarSize: document.getElementById('radarChart').width + 'x' + document.getElementById('radarChart').height,
      legend: document.querySelectorAll('#radarLegend span').length,
      statBars: document.querySelectorAll('#tab-character .stat-bar').length,
    };
  });
  check('stat radar canvas painted', charts.radar > 400, charts.radar);
  check('weekly XP trend canvas painted', charts.trend > 400, charts.trend);
  check('radar sized at DPR', /^[1-9]\d{2,}x\d{2,}$/.test(charts.radarSize), charts.radarSize);
  check('radar legend lists 5 stats', charts.legend === 5, charts.legend);
  check('character shows 5 stat bars', charts.statBars === 5, charts.statBars);

  // ---------- legend selection ----------
  await page.click('.tab-btn[data-tab="legends"]');
  await page.waitForTimeout(120);
  const heroBefore = await page.evaluate(() => state.hero);
  await page.click('#legendsGrid > div:nth-child(2)');
  await page.waitForTimeout(300);
  const heroAfter = await page.evaluate(() => state.hero);
  check('legend click switches hero', heroBefore === 'monarch' && heroAfter === 'berserker',
    heroBefore + ' -> ' + heroAfter);
  check('legend click raised no exception', pageErrors.length === 0, pageErrors.join(' | '));

  // ---------- party roster: only the member matching the active hero lights up ----------
  const partyNone = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#partyList > div')).filter((d) => /ACTIVE/.test(d.innerText)).length);
  check('party shows no ACTIVE row for a hero outside the party', partyNone === 0, partyNone);

  await page.click('#legendsGrid > div:nth-child(4)');   // Cosmic Architect
  await page.waitForTimeout(300);
  const partyActive = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#partyList > div')).map((d) => /ACTIVE/.test(d.innerText)));
  check('party marks Cosmic Architect ACTIVE when that hero leads',
    partyActive.join(',') === 'false,false,false,true', JSON.stringify(partyActive));

  await page.click('#legendsGrid > div:nth-child(2)');   // back to the berserker the suite expects
  await page.waitForTimeout(300);

  // ---------- reward tuning: habit +10 XP / +2 gold / 200 boss damage ----------
  await page.click('.tab-btn[data-tab="habits"]');
  await page.waitForTimeout(120);
  const before = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp, streak: state.habits[0].streak }));
  await page.click('#habitsList > div:nth-child(1) .btn-green');
  await page.waitForTimeout(300);
  const afterHabit = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp, streak: state.habits[0].streak }));
  check('habit + = +10 XP', afterHabit.xp === before.xp + 10, before.xp + ' -> ' + afterHabit.xp);
  check('habit + = +2 gold', afterHabit.gold === before.gold + 2, before.gold + ' -> ' + afterHabit.gold);
  check('habit + = 200 boss damage', afterHabit.boss === before.boss - 200, before.boss + ' -> ' + afterHabit.boss);
  check('habit + = +1 streak', afterHabit.streak === before.streak + 1, before.streak + ' -> ' + afterHabit.streak);

  // ---------- daily: +20 XP / +5 gold / 500 boss damage -> triggers level up at 550 ----------
  await page.click('.tab-btn[data-tab="dailies"]');
  await page.waitForTimeout(120);
  const beforeD = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp }));
  await page.click('#dailiesList > div:nth-child(1) input[type=checkbox]');
  await page.waitForTimeout(400);

  const modal = await page.evaluate(() => {
    const el = document.querySelector('.level-up-flash');
    if (!el) return null;
    return {
      text: el.innerText.replace(/\s+/g, ' ').trim(),
      hasConfirm: !!document.getElementById('levelUpConfirm'),
      role: el.getAttribute('role'),
    };
  });
  check('level-up cinematic modal rendered', modal !== null, JSON.stringify(modal));
  check('modal has rank text + confirmation button',
    !!modal && modal.hasConfirm && /RANK HUNTER/.test(modal.text), modal && modal.text);

  const lv = await page.evaluate(() => ({
    level: state.level, xp: state.xp, xpMax: state.xpMax, mpMax: state.mpMax, mp: state.mp, rank: document.getElementById('rankDisplay').textContent,
  }));
  check('daily completion levelled the player up', lv.level === 4, 'level ' + lv.level);
  check('xpMax grew 550 -> 715', lv.xpMax === 715, lv.xpMax);
  check('mpMax grew 100 -> 105 and refilled', lv.mpMax === 105 && lv.mp === 105, lv.mp + '/' + lv.mpMax);

  // dismiss via the confirmation button (the modal blocks clicks until then)
  await page.click('#levelUpConfirm');
  await page.waitForTimeout(250);
  check('confirmation button dismisses the modal',
    (await page.evaluate(() => !document.querySelector('.level-up-flash'))) === true);

  const afterD = await page.evaluate(() => ({ gold: state.gold, boss: state.bossHp }));
  check('daily = +5 gold', afterD.gold === beforeD.gold + 5, beforeD.gold + ' -> ' + afterD.gold);
  check('daily = 500 boss damage', afterD.boss === beforeD.boss - 500, beforeD.boss + ' -> ' + afterD.boss);

  // ---------- todo: +50 XP / +15 gold / 1000 boss damage ----------
  await page.click('.tab-btn[data-tab="todos"]');
  await page.waitForTimeout(120);
  const beforeT = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp }));
  await page.click('#todosList > div:nth-child(1) input[type=checkbox]');
  await page.waitForTimeout(350);
  const afterT = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp }));
  check('todo = +50 XP', afterT.xp === beforeT.xp + 50, beforeT.xp + ' -> ' + afterT.xp);
  check('todo = +15 gold', afterT.gold === beforeT.gold + 15, beforeT.gold + ' -> ' + afterT.gold);
  check('todo = 1000 boss damage', afterT.boss === beforeT.boss - 1000, beforeT.boss + ' -> ' + afterT.boss);

  // ---------- XP ledger feeds the trend chart ----------
  const ledger = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('momentumState'));
    const d = new Date();
    const m = d.getMonth() + 1, day = d.getDate();
    const key = d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    return { today: s.xpByDay[key], total: Object.keys(s.xpByDay).length };
  });
  check('today ledger recorded 80 XP (10+20+50)', ledger.today === 80, ledger.today);

  // ---------- boss raid: ultimate ----------
  await page.click('.tab-btn[data-tab="boss"]');
  await page.waitForTimeout(120);
  const beforeU = await page.evaluate(() => ({ boss: state.bossHp, mp: state.mp }));
  await page.click('#castUltimateBtn');
  await page.waitForTimeout(250);
  const afterU = await page.evaluate(() => ({ boss: state.bossHp, mp: state.mp }));
  check('cast ultimate = 1500 damage for 10 MP',
    afterU.boss === beforeU.boss - 1500 && afterU.mp === beforeU.mp - 10,
    beforeU.boss + '->' + afterU.boss + ' hp, ' + beforeU.mp + '->' + afterU.mp + ' mp');

  const burst = await page.evaluate(() => window.particleField.dots.filter((d) => d.burst).length);
  check('ultimate fired a particle burst', burst > 20, burst + ' burst dots');

  // ---------- about / docs ----------
  const sections = await page.evaluate(() => ({
    about: (document.getElementById('about') || {}).innerText || '',
    docs: (document.getElementById('docs') || {}).innerText || '',
  }));
  check('About section has content', sections.about.length > 80, sections.about.length + ' chars');
  check('Docs section has content', sections.docs.length > 120, sections.docs.length + ' chars');

  // ---------- persistence ----------
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const persisted = await page.evaluate(() => ({ level: state.level, hero: state.hero, rank: document.getElementById('rankDisplay').textContent }));
  check('state persists across reload',
    persisted.level === 4 && persisted.hero === 'berserker', JSON.stringify(persisted));

  // ---------- mobile viewport ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  const mobile = await page.evaluate(() => {
    const bar = document.querySelector('#app > div');
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      tabs: document.querySelectorAll('.tab-btn').length,
      tabBarScrolls: bar ? bar.scrollWidth > bar.clientWidth : false,
      hudWrapped: document.querySelector('header').getBoundingClientRect().height,
    };
  });
  check('no horizontal overflow at 390x844', mobile.overflow <= 1, mobile.overflow + 'px');
  check('all 7 tabs present on a phone', mobile.tabs === 7, mobile.tabs);
  check('tab bar scrolls rather than clipping', mobile.tabBarScrolls === true, mobile.tabBarScrolls);
  check('HUD stays a sane height on a phone', mobile.hudWrapped < 200, mobile.hudWrapped + 'px');

  const mobileTabs = [];
  for (const t of ['habits', 'dailies', 'todos', 'legends', 'character', 'boss', 'licenses']) {
    await page.click('.tab-btn[data-tab="' + t + '"]');
    await page.waitForTimeout(90);
    const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.tab-content'))
      .filter((el) => getComputedStyle(el).display !== 'none').length);
    if (shown !== 1) mobileTabs.push(t + ':' + shown);
  }
  check('all 7 tabs still switch on a phone', mobileTabs.length === 0, mobileTabs.join(',') || 'none broken');

  check('no uncaught page errors after full interaction', pageErrors.length === 0, pageErrors.join(' | '));
  check('no console.error after full interaction', consoleErrors.length === 0, consoleErrors.join(' | '));
  const dicebearFails = failedRequests.filter((u) => u.includes('dicebear'));
  check('no failed avatar requests', dicebearFails.length === 0, dicebearFails.length);

  const failures = results.filter((r) => !r.ok);
  console.log('\nFAILURES: ' + failures.length + ' / ' + results.length);
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', (e && e.stack) || e); process.exit(2); });
