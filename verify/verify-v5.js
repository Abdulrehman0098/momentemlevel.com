// V5.0 Apex verification harness for momentum-site/app.html.
// Serves the site, drives real Chromium, asserts the spec tab by tab.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.env.SITE_ROOT || 'D:/src/momentum-site');
const PORT = Number(process.env.PORT || 8841);

const CANDIDATES = [
  process.env.CHROME_EXE,
  process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
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
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail === undefined ? '' : '  [' + detail + ']'));
}
const TABS = ['habits', 'dailies', 'todos', 'legends', 'character', 'boss', 'achievements', 'calendar', 'analytics', 'settings', 'leaderboard', 'licenses'];

(async () => {
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no chrome binary found');
  const server = await serve();
  const URL = 'http://127.0.0.1:' + PORT + '/app.html';
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2200);

  check('no uncaught page errors on boot', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('no console.error on boot', consoleErrors.length === 0, consoleErrors.slice(0, 2).map((t) => t.split('\n')[0]).join(' | '));

  /* ---------- HUD ---------- */
  const hud = await page.evaluate(() => ({
    status: document.querySelector('header p').innerText.replace(/\s+/g, ' ').trim(),
    level: document.getElementById('levelDisplay').textContent,
    rank: document.getElementById('rankDisplay').textContent,
    xp: document.getElementById('xpDisplay').textContent,
    mp: document.getElementById('mpDisplay').textContent,
    hp: document.getElementById('hpDisplay').textContent,
    gold: document.getElementById('goldDisplay').textContent,
    meters: ['hpMeter', 'mpMeter', 'xpMeter'].map((id) => document.getElementById(id).style.width),
  }));
  check('HUD shows V5.0.0 APEX', /V5\.0\.0 APEX/.test(hud.status), hud.status);
  check('HUD level 3 / E-RANK', hud.level === '3' && hud.rank === 'E-RANK', hud.level + ' ' + hud.rank);
  check('HUD pools seeded (520/550 XP, 100/100 MP)', hud.xp === '520/550' && hud.mp === '100/100', hud.xp + ' ' + hud.mp);
  check('HUD gold 650', hud.gold === '650', hud.gold);
  check('HUD meters painted', hud.meters.every((w) => parseFloat(w) > 0), hud.meters.join(','));

  /* ---------- effects ---------- */
  const fx = await page.evaluate(() => ({
    sweep: getComputedStyle(document.querySelector('.scanline')).animationDuration,
    crt: getComputedStyle(document.querySelector('.scanline-container'), '::before').backgroundImage,
    particles: window.particleField.dots.length,
    running: window.particleField.lastTs > 0,
    stars: document.querySelectorAll('.star').length,
    tabular: getComputedStyle(document.body).fontVariantNumeric,
  }));
  check('8s scanline sweep', fx.sweep === '8s', fx.sweep);
  check('persistent CRT pattern', fx.crt.includes('repeating-linear-gradient'), fx.crt.slice(0, 30));
  check('46-dot particle field running', fx.particles === 46 && fx.running, fx.particles);
  check('120 stars spawned', fx.stars === 120, fx.stars);
  check('tabular figures', fx.tabular.includes('tabular-nums'), fx.tabular);

  /* ---------- seed ---------- */
  const seed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('momentum.v5.state'));
    return {
      habits: s.habits.map((h) => h.name), dailies: s.dailies.length, todos: s.todos.length,
      heroes: HEROES.length, achievements: ACHIEVEMENTS.length, aliases: s.aliases.length,
      cat: s.habits.map((h) => h.cat), keys: Object.keys(s.xpByDay).length,
      unlocked: s.achievements.slice().sort(),
    };
  });
  check('3 habits seeded', seed.habits.join('|') === 'Morning Run|Read 20 Pages|Drink Water', seed.habits.join('|'));
  check('4 dailies + 4 todos seeded', seed.dailies === 4 && seed.todos === 4, seed.dailies + '/' + seed.todos);
  check('8 hero archetypes', seed.heroes === 8, seed.heroes);
  check('25 achievements defined', seed.achievements === 25, seed.achievements);
  check('7-day XP ledger', seed.keys === 7, seed.keys);
  check('habits carry categories', seed.cat.every(Boolean), seed.cat.join(','));
  check('leaderboard seeded with one hunter', seed.aliases === 1, seed.aliases);
  check('boot unlocked the earned achievements',
    seed.unlocked.join(',') === 'habits_10,streak_7,xp_1k', seed.unlocked.join(','));

  /* ---------- 12 tabs ---------- */
  const badTabs = [];
  for (const t of TABS) {
    await page.click('.tab-btn[data-tab="' + t + '"]');
    await page.waitForTimeout(140);
    const ok = await page.evaluate((id) => {
      const panel = document.getElementById('tab-' + id);
      const shown = Array.from(document.querySelectorAll('.tab-content')).filter((el) => getComputedStyle(el).display !== 'none');
      return panel.classList.contains('active') && shown.length === 1 && shown[0] === panel;
    }, t);
    if (!ok) badTabs.push(t);
  }
  check('all 12 tabs switch panels', badTabs.length === 0, badTabs.join(',') || 'none broken');
  check('tab bar renders 12 buttons', (await page.evaluate(() => document.querySelectorAll('.tab-btn').length)) === 12);

  /* ---------- tab 1: habits ---------- */
  await page.click('.tab-btn[data-tab="habits"]');
  await page.waitForTimeout(140);
  const h0 = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp, streak: state.habits[0].streak }));
  await page.click('#habitsList [data-act="complete"]');
  await page.waitForTimeout(300);
  const h1 = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp, streak: state.habits[0].streak, conf: typeof confetti }));
  check('habit + = +10 XP', h1.xp === h0.xp + 10, h0.xp + '->' + h1.xp);
  check('habit + = +2 gold', h1.gold === h0.gold + 2, h0.gold + '->' + h1.gold);
  check('habit + = 200 boss damage', h1.boss === h0.boss - 200, h0.boss + '->' + h1.boss);
  check('habit + = +1 streak', h1.streak === h0.streak + 1, h0.streak + '->' + h1.streak);
  await page.click('#habitsList [data-act="break"]');
  await page.waitForTimeout(220);
  const h2 = await page.evaluate(() => state.habits[0].streak);
  check('habit − = −1 streak', h2 === h1.streak - 1, h1.streak + '->' + h2);
  await page.fill('#newHabitInput', 'Meditate 10 min');
  await page.click('#btnAddHabit');
  await page.waitForTimeout(250);
  const added = await page.evaluate(() => {
    const h = state.habits[state.habits.length - 1];
    return { n: state.habits.length, name: h.name, cat: h.cat };
  });
  check('add habit works and infers a category', added.n === 4 && added.cat === 'health', JSON.stringify(added));

  /* ---------- tab 2: dailies (crosses the level threshold on purpose) ---------- */
  await page.click('.tab-btn[data-tab="dailies"]');
  await page.waitForTimeout(140);
  const d0 = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp, earned: state.totals.xpEarned, level: state.level }));
  await page.click('#dailiesList input[type=checkbox]');
  await page.waitForTimeout(500);
  const modal = await page.evaluate(() => {
    const el = document.querySelector('.level-up-flash');
    return el ? { text: el.innerText.replace(/\s+/g, ' ').trim(), role: el.getAttribute('role'), confirm: !!document.getElementById('levelUpConfirm') } : null;
  });
  check('crossing the XP threshold fires the level-up cinematic', modal !== null && modal.role === 'dialog' && modal.confirm, modal && modal.text);
  check('cinematic names the new rank tier', !!modal && /RANK HUNTER/.test(modal.text), modal && modal.text);
  const d1 = await page.evaluate(() => ({ gold: state.gold, boss: state.bossHp, earned: state.totals.xpEarned, level: state.level, xpMax: state.xpMax, mpMax: state.mpMax, mp: state.mp, perfect: state.perfectDays.indexOf(isoDay(new Date())) !== -1 }));
  check('daily = +20 XP (level-up proof ledger)', d1.earned === d0.earned + 20, d0.earned + '->' + d1.earned);
  check('daily = +5 gold', d1.gold === d0.gold + 5, d0.gold + '->' + d1.gold);
  check('daily = 500 boss damage', d1.boss === d0.boss - 500, d0.boss + '->' + d1.boss);
  check('level up: 3 -> 4, xpMax 550 -> 715, pools grow', d1.level === 4 && d1.xpMax === 715 && d1.mpMax === 105 && d1.mp === 105, JSON.stringify({ l: d1.level, xpMax: d1.xpMax, mp: d1.mp + '/' + d1.mpMax }));
  check('partial dailies is not a perfect day', d1.perfect === false, d1.perfect);
  await page.click('#levelUpConfirm');
  await page.waitForTimeout(300);
  check('confirmation button dismisses the cinematic',
    (await page.evaluate(() => !document.querySelector('.level-up-flash'))) === true);
  await page.click('#dailiesList input[type=checkbox]');
  await page.waitForTimeout(300);
  const d2 = await page.evaluate(() => ({ gold: state.gold, boss: state.bossHp, xp: state.xp, done: state.dailies[0].done }));
  check('unchecking a daily reverses gold and boss damage',
    d2.gold === d0.gold && d2.boss === d0.boss && d2.done === false, JSON.stringify(d2));
  check('XP never goes negative on an undo', d2.xp >= 0, d2.xp);

  /* ---------- tab 3: todos ---------- */
  await page.click('.tab-btn[data-tab="todos"]');
  await page.waitForTimeout(140);
  const t0 = await page.evaluate(() => ({ xp: state.xp, gold: state.gold, boss: state.bossHp }));
  await page.click('#todosList input[type=checkbox]');
  await page.waitForTimeout(350);
  const t1 = await page.evaluate(() => ({
    xp: state.xp, gold: state.gold, boss: state.bossHp,
    open: document.querySelectorAll('#todosList > div').length,
    done: document.querySelectorAll('#completedWrap > div').length,
  }));
  check('todo = +50 XP', t1.xp === t0.xp + 50, t0.xp + '->' + t1.xp);
  check('todo = +15 gold', t1.gold === t0.gold + 15, t0.gold + '->' + t1.gold);
  check('todo = 1000 boss damage', t1.boss === t0.boss - 1000, t0.boss + '->' + t1.boss);
  check('completed todo moves to the collapsible section', t1.open === 3 && t1.done === 1, t1.open + ' open / ' + t1.done + ' done');

  /* ---------- tab 4: legends ---------- */
  await page.click('.tab-btn[data-tab="legends"]');
  await page.waitForTimeout(160);
  const lg = await page.evaluate(() => ({
    cards: document.querySelectorAll('#legendsGrid > article').length,
    names: Array.from(document.querySelectorAll('#legendsGrid h3')).map((h) => h.textContent.trim()),
    bars: document.querySelectorAll('#legendsGrid .stat-bar').length,
    active: document.querySelectorAll('#legendsGrid [aria-current="true"]').length,
  }));
  check('8 legend cards rendered', lg.cards === 8, lg.cards);
  check('legend names are the 8 originals',
    lg.names.join('|') === 'SHADOW MONARCH|RAGING BERSERKER|ARCHMAGE|COSMIC ARCHITECT|BLADE DANCER|VOID WALKER|IRON SENTINEL|STORM CALLER',
    lg.names.join('|'));
  check('each legend shows 5 stat bars', lg.bars === 40, lg.bars);
  check('exactly one legend is ACTIVE', lg.active === 1, lg.active);
  await page.click('#legendsGrid article:nth-child(5) [data-act="selectHero"]');
  await page.waitForTimeout(400);
  const sel = await page.evaluate(() => ({
    hero: state.hero,
    headerSeed: /seed=([^&]+)/.exec(document.getElementById('headerAvatar').src)[1],
    charName: document.getElementById('heroNameDisplay').textContent,
    partyLeader: document.querySelector('#partyList p').textContent,
    legendary: state.achievements.indexOf('legendary') !== -1,
  }));
  check('selecting a hero updates state + header + character + party',
    sel.hero === 'blade_dancer' && sel.headerSeed === 'Dancer' && sel.charName === 'Blade Dancer' && sel.partyLeader === 'Blade Dancer',
    JSON.stringify(sel));

  /* ---------- tab 5: character ---------- */
  await page.click('.tab-btn[data-tab="character"]');
  await page.waitForTimeout(600);
  const ch = await page.evaluate(() => {
    function lit(id) {
      const c = document.getElementById(id);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) { n++; if (n > 500) break; } }
      return n;
    }
    return {
      helmet: document.getElementById('equipHelmet').textContent,
      weapon: document.getElementById('equipWeapon').textContent,
      statBars: document.querySelectorAll('#charStats .stat-bar').length,
      radar: lit('radarChart'), trend: lit('xpTrendChart'),
      radarLegend: document.querySelectorAll('#radarLegend span').length,
      vitals: document.querySelectorAll('#vitalsList > div').length,
      radarSize: document.getElementById('radarChart').width + 'x' + document.getElementById('radarChart').height,
    };
  });
  check('equipment shows the selected hero gear', ch.helmet === 'Mask of Whispers' && ch.weapon === 'Pair of Dawnblades', ch.helmet + ' / ' + ch.weapon);
  check('5 stat bars in the character sheet', ch.statBars === 5, ch.statBars);
  check('radar canvas painted', ch.radar > 500, ch.radar);
  check('weekly XP trend painted', ch.trend > 500, ch.trend);
  check('radar legend lists 5 stats', ch.radarLegend === 5, ch.radarLegend);
  check('vitals list populated', ch.vitals === 8, ch.vitals);
  check('canvas sized at device pixel ratio', /^[1-9]\d{2,}x\d{2,}$/.test(ch.radarSize), ch.radarSize);

  /* ---------- tab 6: boss ---------- */
  await page.click('.tab-btn[data-tab="boss"]');
  await page.waitForTimeout(200);
  const b0 = await page.evaluate(() => ({ boss: state.bossHp, mp: state.mp, party: document.querySelectorAll('#partyList > div').length }));
  await page.click('#castUltimateBtn');
  await page.waitForTimeout(320);
  const b1 = await page.evaluate(() => ({
    boss: state.bossHp, mp: state.mp,
    burst: window.particleField.dots.filter((d) => d.burst).length,
    meta: document.querySelectorAll('#bossMeta > div').length,
    aria: document.getElementById('bossHpBar').getAttribute('aria-valuenow'),
  }));
  check('ultimate = 1500 damage for 10 MP', b1.boss === b0.boss - 1500 && b1.mp === b0.mp - 10, b0.boss + '->' + b1.boss);
  check('ultimate fires a particle burst', b1.burst > 20, b1.burst);
  check('boss HP bar exposes aria-valuenow', Number(b1.aria) === b1.boss, b1.aria);
  check('party roster shows 4 hunters', b0.party === 4, b0.party);
  check('boss meta tiles rendered', b1.meta === 3, b1.meta);
  await page.click('#btnReviveBoss');
  await page.waitForTimeout(220);
  const b2 = await page.evaluate(() => ({ hp: state.bossHp, defeated: state.bossDefeated }));
  check('revive boss resets to full HP', b2.hp === 10000 && b2.defeated === false, JSON.stringify(b2));

  /* ---------- tab 7: achievements ---------- */
  await page.click('.tab-btn[data-tab="achievements"]');
  await page.waitForTimeout(220);
  const ach = await page.evaluate(() => ({
    cards: document.querySelectorAll('#achievementsGrid > article').length,
    locked: document.querySelectorAll('#achievementsGrid .locked').length,
    unlocked: document.querySelectorAll('#achievementsGrid .unlocked').length,
    legendary: document.querySelectorAll('#achievementsGrid .ach-rarity-legendary').length,
    summary: document.getElementById('achSummary').textContent,
    progress: document.getElementById('achProgressBar').style.width,
  }));
  check('25 achievement cards render', ach.cards === 25, ach.cards);
  check('locked cards hide the name', (await page.evaluate(() => (document.querySelector('#achievementsGrid .locked h3') || {}).textContent)) === '???');
  check('unlocked cards show a date',
    await page.evaluate(() => /\d{4}-\d{2}-\d{2}/.test(document.querySelector('#achievementsGrid .unlocked').innerText)));
  check('legendary tier has 4 entries', ach.legendary === 4, ach.legendary);
  check('progress bar reflects unlocks', parseFloat(ach.progress) > 0, ach.progress);
  await page.click('#achFilters button[data-ach-filter="unlocked"]');
  await page.waitForTimeout(200);
  const filtered = await page.evaluate(() => document.querySelectorAll('#achievementsGrid > article').length);
  check('achievement filter works', filtered === ach.unlocked, filtered + ' of ' + ach.unlocked);

  /* ---------- tab 8: calendar ---------- */
  await page.click('.tab-btn[data-tab="calendar"]');
  await page.waitForTimeout(260);
  const cal = await page.evaluate(() => ({
    label: document.getElementById('calLabel').textContent,
    cells: document.querySelectorAll('#calGrid .heat-cell').length,
    days: document.querySelectorAll('#calGrid .heat-cell[data-day]').length,
    today: document.querySelectorAll('#calGrid .heat-cell.today').length,
    shaded: document.querySelectorAll('#calGrid .heat-1, #calGrid .heat-2, #calGrid .heat-3, #calGrid .heat-4, #calGrid .heat-5').length,
    summary: document.getElementById('calSummary').textContent,
  }));
  check('calendar renders a month grid', cal.cells % 7 === 0 && cal.cells >= 28, cal.cells);
  check('every day cell is addressable', cal.days >= 28, cal.days);
  check('today is marked', cal.today === 1, cal.today);
  check('XP intensity shading present', cal.shaded > 0, cal.shaded);
  check('month summary reports XP', /\d+ XP/.test(cal.summary), cal.summary);
  await page.click('#calGrid .heat-cell[data-day]');
  await page.waitForTimeout(250);
  const dayModal = await page.evaluate(() => {
    const m = document.querySelector('.modal-backdrop');
    return m ? { modal: m.getAttribute('aria-modal'), text: m.innerText.replace(/\s+/g, ' ').slice(0, 90) } : null;
  });
  check('day cell opens an aria-modal detail dialog', !!dayModal && dayModal.modal === 'true', dayModal && dayModal.text);
  check('day dialog reports XP and boss damage', /XP/.test(dayModal.text) && /BOSS DMG/i.test(dayModal.text), dayModal.text);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes the dialog', (await page.evaluate(() => !document.querySelector('.modal-backdrop'))) === true);
  await page.click('#calPrev');
  await page.waitForTimeout(200);
  const prevLabel = await page.evaluate(() => document.getElementById('calLabel').textContent);
  check('calendar navigates months', prevLabel !== cal.label, cal.label + ' -> ' + prevLabel);
  await page.click('#calToday');
  await page.waitForTimeout(200);
  check('Today button returns to the current month',
    (await page.evaluate(() => document.getElementById('calLabel').textContent)) === cal.label);

  /* ---------- tab 9: analytics ---------- */
  await page.click('.tab-btn[data-tab="analytics"]');
  await page.waitForTimeout(700);
  const an = await page.evaluate(() => {
    function lit(id) {
      const c = document.getElementById(id);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) { n++; if (n > 500) break; } }
      return n;
    }
    return {
      metrics: document.querySelectorAll('#metricsGrid > div').length,
      xp30: lit('xp30Chart'), bars: lit('habitBarChart'), donut: lit('categoryChart'),
      legend: document.querySelectorAll('#categoryLegend span').length,
    };
  });
  check('6 metric cards', an.metrics === 6, an.metrics);
  check('30-day XP chart painted', an.xp30 > 500, an.xp30);
  check('14-day habit bar chart painted', an.bars > 500, an.bars);
  check('category donut painted', an.donut > 500, an.donut);
  check('donut legend lists 4 categories', an.legend === 4, an.legend);

  /* ---------- tab 10: settings ---------- */
  await page.click('.tab-btn[data-tab="settings"]');
  await page.waitForTimeout(220);
  /* The radios and switches are visually hidden inside their labels, so the
     label is what a user clicks — the harness clicks the label too. */
  await page.click('label[for="theme-light"]');
  await page.waitForTimeout(300);
  const light = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    stored: JSON.parse(localStorage.getItem('momentum.v5.prefs')).theme,
    checked: document.getElementById('theme-light').checked,
  }));
  check('theme switch is instant and persisted', light.attr === 'light' && light.stored === 'light' && light.checked === true, JSON.stringify(light));
  await page.click('label[for="theme-dark"]');
  await page.waitForTimeout(250);
  check('theme switches back', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.click('#accentSwatches button[data-accent-value="gold"]');
  await page.waitForTimeout(250);
  const accent = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-accent'),
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  }));
  check('accent swatch repoints the primary token', accent.attr === 'gold' && accent.primary === '#FBBF24', JSON.stringify(accent));
  await page.click('#accentSwatches button[data-accent-value="cyan"]');
  await page.waitForTimeout(200);
  await page.fill('#zoomRange', '150');
  await page.dispatchEvent('#zoomRange', 'input');
  await page.waitForTimeout(300);
  const zoom = await page.evaluate(() => ({
    transform: document.getElementById('zoom-root').style.transform,
    readout: document.getElementById('zoomReadout').textContent,
    stored: JSON.parse(localStorage.getItem('momentum.v5.prefs')).zoom,
    headerOutside: !document.getElementById('zoom-root').contains(document.querySelector('header')),
  }));
  check('zoom slider scales the content root', zoom.transform === 'scale(1.5)', zoom.transform);
  check('zoom readout + persistence', zoom.readout === '150%' && zoom.stored === 150, JSON.stringify(zoom));
  check('header stays outside the zoom root', zoom.headerOutside === true);
  await page.fill('#zoomRange', '100');
  await page.dispatchEvent('#zoomRange', 'input');
  await page.waitForTimeout(200);
  await page.click('label[for="toggleAnim"]');
  await page.waitForTimeout(250);
  const animOff = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-anim'),
    stored: JSON.parse(localStorage.getItem('momentum.v5.prefs')).animations,
  }));
  check('animations toggle flips the root attribute', animOff.attr === 'off' && animOff.stored === false, JSON.stringify(animOff));
  await page.click('label[for="toggleAnim"]');
  await page.waitForTimeout(200);
  check('animations toggle flips back', (await page.evaluate(() => document.documentElement.getAttribute('data-anim'))) === 'on');
  await page.selectOption('#weekStartSelect', '0');
  await page.waitForTimeout(200);
  check('week start preference persists',
    (await page.evaluate(() => JSON.parse(localStorage.getItem('momentum.v5.prefs')).weekStartsOn)) === 0);
  await page.selectOption('#weekStartSelect', '1');
  await page.waitForTimeout(150);
  check('account section is disabled, not broken',
    (await page.evaluate(() => document.getElementById('btnAccount').disabled)) === true);

  /* ---------- tab 11: leaderboard ---------- */
  await page.click('.tab-btn[data-tab="leaderboard"]');
  await page.waitForTimeout(220);
  const lb0 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#aliasList > div').length,
    active: document.querySelectorAll('#aliasList [data-act="aliasActivate"][disabled]').length,
  }));
  check('seeded hunter is listed and active', lb0.rows === 1 && lb0.active === 1, JSON.stringify(lb0));
  await page.click('#btnAddHunter');
  await page.waitForTimeout(300);
  check('add-hunter dialog opens', (await page.evaluate(() => !!document.querySelector('.modal-backdrop'))) === true);
  await page.fill('#hunterName', 'Nightfall');
  await page.click('#hunterEmoji button:nth-child(5)');
  await page.click('#hunterAura button:nth-child(3)');
  await page.click('.modal-panel [data-act="save"]');
  await page.waitForTimeout(350);
  const lb1 = await page.evaluate(() => ({
    rows: document.querySelectorAll('#aliasList > div').length,
    names: Array.from(document.querySelectorAll('#aliasList p')).map((p) => p.textContent.trim()).filter((t) => t.length && !t.startsWith('LVL')),
    stored: JSON.parse(localStorage.getItem('momentum.v5.state')).aliases.length,
  }));
  check('adding a hunter appends a row and persists', lb1.rows === 2 && lb1.stored === 2, JSON.stringify(lb1));
  check('new hunter carries its name', lb1.names.indexOf('Nightfall') !== -1, lb1.names.join(','));
  await page.selectOption('#sortSelect', 'gold');
  await page.waitForTimeout(220);
  check('sort dropdown re-renders the list', (await page.evaluate(() => document.querySelectorAll('#aliasList > div').length)) === 2);

  /* ---------- tab 12: licenses ---------- */
  await page.click('.tab-btn[data-tab="licenses"]');
  await page.waitForTimeout(200);
  const lic = await page.evaluate(() => ({
    entries: document.querySelectorAll('#licensesBody > div').length,
    text: document.getElementById('licensesBody').innerText,
  }));
  check('licenses lists every attribution', lic.entries === 12, lic.entries);
  check('licenses name the original-archetype disclaimer',
    /original creations/.test(lic.text) && /not affiliated/.test(lic.text));
  check('licenses carry the version badge', /V5\.0\.0 APEX/.test(lic.text));

  /* ---------- zoom widget ---------- */
  await page.click('#zoomIn');
  await page.waitForTimeout(250);
  const zw = await page.evaluate(() => ({
    readout: document.getElementById('zoomReadout').textContent,
    transform: document.getElementById('zoom-root').style.transform,
  }));
  check('zoom widget + button works', zw.readout === '125%' && zw.transform === 'scale(1.25)', JSON.stringify(zw));
  await page.click('#zoomOut');
  await page.waitForTimeout(200);
  check('zoom widget − button works', (await page.evaluate(() => document.getElementById('zoomReadout').textContent)) === '100%');
  await page.click('#zoomFit');
  await page.waitForTimeout(200);
  check('fit button resets to 100%', (await page.evaluate(() => document.getElementById('zoomReadout').textContent)) === '100%');

  /* ---------- keyboard ---------- */
  await page.keyboard.press('9');
  await page.waitForTimeout(220);
  check('digit key switches tab (9 = analytics)',
    (await page.evaluate(() => document.querySelector('.tab-content.active').id)) === 'tab-analytics');
  await page.keyboard.press('?');
  await page.waitForTimeout(250);
  check('? opens the shortcuts dialog',
    await page.evaluate(() => /Keyboard Shortcuts/i.test((document.querySelector('.modal-panel') || {}).innerText || '')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape closes the shortcuts dialog', (await page.evaluate(() => !document.querySelector('.modal-backdrop'))) === true);
  await page.keyboard.press('h');
  await page.waitForTimeout(220);
  check('H jumps to habits and focuses the input',
    await page.evaluate(() => document.activeElement.id === 'newHabitInput'));
  await page.keyboard.press('Control+=');
  await page.waitForTimeout(250);
  check('Ctrl+= zooms in', (await page.evaluate(() => JSON.parse(localStorage.getItem('momentum.v5.prefs')).zoom)) === 125);
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(220);
  check('Ctrl+0 resets zoom', (await page.evaluate(() => JSON.parse(localStorage.getItem('momentum.v5.prefs')).zoom)) === 100);

  /* ---------- a11y ---------- */
  const a11y = await page.evaluate(() => ({
    skip: !!document.querySelector('.skip-link'),
    live: document.getElementById('sr-live').getAttribute('aria-live'),
    landmarks: ['header', 'nav', 'main', 'footer'].every((t) => !!document.querySelector(t)),
    iconButtons: Array.from(document.querySelectorAll('button')).filter((b) => !b.innerText.trim()).length,
    labelled: Array.from(document.querySelectorAll('button')).filter((b) => !b.innerText.trim()).every((b) => b.getAttribute('aria-label')),
    roles: document.querySelectorAll('[role="tab"]').length,
  }));
  check('skip link present', a11y.skip);
  check('aria-live region is polite', a11y.live === 'polite', a11y.live);
  check('semantic landmarks present', a11y.landmarks);
  check('every icon-only button has an aria-label', a11y.labelled, a11y.iconButtons + ' icon buttons');
  check('tab bar uses role=tab', a11y.roles === 12, a11y.roles);

  /* WCAG contrast on the real computed colours (§15 requires >= 4.5:1). */
  const contrast = await page.evaluate(() => {
    function lum(rgb) {
      const parts = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    function parse(s) {
      const m = /rgba?\(([^)]+)\)/.exec(s || '');
      return m ? m[1].split(',').slice(0, 3).map(Number) : null;
    }
    const bg = parse(getComputedStyle(document.body).backgroundColor) || [5, 5, 8];
    const out = {};
    ['.muted', '.section-title', '#hud p', '#achievementsGrid p', '.ach-card p'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; return; }
      const fg = parse(getComputedStyle(el).color);
      if (!fg) { out[sel] = null; return; }
      const a = lum(fg), b = lum(bg);
      out[sel] = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    });
    return out;
  });
  check('body copy meets WCAG AA (>= 4.5:1)', Object.values(contrast).every((r) => r !== null && r >= 4.5), JSON.stringify(contrast));

  /* ---------- persistence ---------- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  const persisted = await page.evaluate(() => ({
    hero: state.hero, aliases: state.aliases.length, achievements: state.achievements.length,
    zoom: JSON.parse(localStorage.getItem('momentum.v5.prefs')).zoom,
  }));
  check('state survives a reload', persisted.hero === 'blade_dancer' && persisted.aliases === 2, JSON.stringify(persisted));

  /* ---------- PWA ---------- */
  const pwa = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    let manifest = null;
    try {
      const res = await fetch(link.getAttribute('href'));
      manifest = await res.json();
    } catch (e) { manifest = null; }
    return {
      href: link && link.getAttribute('href'),
      name: manifest && manifest.name,
      icons: manifest && manifest.icons.length,
      shortcuts: manifest && manifest.shortcuts.length,
      start: manifest && manifest.start_url,
      sw: 'serviceWorker' in navigator,
      apple: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'),
      csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      referrer: document.querySelector('meta[name="referrer"]').getAttribute('content'),
    };
  });
  check('manifest linked and parseable', pwa.href === 'app.webmanifest' && !!pwa.name, pwa.href + ' ' + pwa.name);
  check('manifest declares icons and shortcuts', pwa.icons === 3 && pwa.shortcuts === 3, pwa.icons + '/' + pwa.shortcuts);
  check('manifest start_url is the app', pwa.start === './app.html', pwa.start);
  check('service worker API available', pwa.sw === true);
  check('iOS meta + CSP + referrer policy present', pwa.apple && pwa.csp && pwa.referrer === 'strict-origin-when-cross-origin', JSON.stringify([pwa.apple, pwa.csp, pwa.referrer]));

  /* ---------- responsive ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    tabs: document.querySelectorAll('.tab-btn').length,
    zoomHidden: getComputedStyle(document.getElementById('zoomWidget')).display === 'none',
    heatCells: document.querySelectorAll('#calGrid .heat-cell').length,
  }));
  check('no horizontal overflow at 390x844', mobile.overflow <= 1, mobile.overflow + 'px');
  check('zoom widget hidden on mobile', mobile.zoomHidden === true);
  const mobileTabs = [];
  for (const t of TABS) {
    await page.click('.tab-btn[data-tab="' + t + '"]');
    await page.waitForTimeout(80);
    const shown = await page.evaluate(() => Array.from(document.querySelectorAll('.tab-content')).filter((el) => getComputedStyle(el).display !== 'none').length);
    if (shown !== 1) mobileTabs.push(t + ':' + shown);
  }
  check('all 12 tabs still switch on a phone', mobileTabs.length === 0, mobileTabs.join(',') || 'none broken');

  /* ---------- console hygiene ---------- */
  const dicebearFails = consoleErrors.filter((t) => /dicebear/i.test(t));
  check('no failed avatar requests', dicebearFails.length === 0, dicebearFails.length);
  check('no uncaught page errors after full interaction', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  check('no console.error after full interaction', consoleErrors.length === 0, consoleErrors.slice(0, 2).map((t) => t.split('\n')[0]).join(' | '));

  const failures = results.filter((r) => !r.ok);
  console.log('\nFAILURES: ' + failures.length + ' / ' + results.length);
  if (failures.length) console.log('failed: ' + failures.map((f) => f.name).join(' | '));
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', (e && e.stack) || e); process.exit(2); });
