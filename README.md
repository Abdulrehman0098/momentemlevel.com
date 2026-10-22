# MOMENTUM — Web client & site

**V5.0.0 Apex** · single-file app + marketing site · no build step, no server, no account

---

## What is verified right now

| Suite | Command | Result |
|---|---|---|
| App — 12 tabs, every action | `node verify/verify-v5.js` | **126 / 126 pass** |
| Landing + legal pages | `node verify/verify-landing.js` | **66 / 66 pass** |

Both numbers come from real Chromium runs against the files on disk, not from
inspection. Every suite starts its own static server and exits non-zero on the
first failure.

---

## Files

```
momentum-site\
├── index.html                    landing page (11 sections)
├── app.html                      THE APP — 12 tabs, 3,105 lines, self-contained
├── app.webmanifest               PWA manifest for the app  (start_url ./app.html)
├── manifest.json                 PWA manifest for the site (start_url ./)
├── sw.js                         service worker: shell cache-first, avatars network-first
├── privacy.html                  privacy policy
├── terms.html                    terms of service
├── icons\icon.svg                app icon source (PNG exports still to generate)
├── index.v4.0.5.backup.html      previous release — the rollback if anything regresses
├── verify\
│   ├── verify-v5.js              126-check suite for app.html
│   ├── verify-landing.js         66-check suite for index/privacy/terms
│   └── shots-v5.js               screenshots of every tab → .build/shots/
└── .build\
    ├── assemble.py               concatenates parts → app.html + index.html
    └── parts\                    01…09 for the app, l1…l3 for the landing page
```

There is no npm install, no bundler and no framework. `app.html` carries all its
CSS in one `<style>` and all its JS in `<script>` blocks; Tailwind, canvas-confetti
and the three fonts come from CDNs and degrade gracefully when blocked.

---

## Run it

```bash
cd D:\src\momentum-site
python -m http.server 8080
#   http://localhost:8080/index.html   landing page
#   http://localhost:8080/app.html     the app
```

`file://` works too, except that the service worker only registers over
http(s) — the app detects that and skips registration.

## Verify it

```bash
cd D:\src\momentum-site\verify
npm install playwright-core      # once, or set CHROME_EXE to any Chrome
node verify-v5.js
node verify-landing.js
```

---

## Editing the app

`app.html` is assembled from parts, so a ~158 KB file can be edited in pieces
without ever emitting a truncated write.

```bash
cd D:\src\momentum-site\.build
python assemble.py
#   wrote app.html   (157671 bytes, 3105 lines)
#   wrote index.html ( 51780 bytes,  969 lines)
#   ok  doctype · balanced script blocks · 12 tab panels · no TODO markers …
```

`assemble.py` refuses to write when a structural check fails — unbalanced script
tags, a missing tab panel, an ellipsis placeholder or a `TODO` marker.

| Part | Contents |
|---|---|
| `01-head.html` | meta, CSP, fonts, Tailwind config, the entire design system `<style>` |
| `02-body-top.html` | HUD header, 12-button tab bar, zoom widget, tabs 1-6 |
| `03-body-bottom.html` | tabs 7-12, footer, modal host |
| `04-js-data.html` | 8 heroes, 25 achievements, categories, SFX recipes, licence text |
| `05-js-core.html` | state, prefs, audio, haptics, particles, modals, export/import |
| `06-js-charts.html` | radar, weekly trend, 30-day line, 14-day bars, donut |
| `07-js-render.html` | one renderer per tab + tab switching |
| `08-js-actions.html` | every action, the achievements engine, dialogs |
| `09-js-boot.html` | event wiring, keyboard map, the 16-step boot sequence |

---

## The 12 tabs

| # | Tab | What it does |
|---|---|---|
| 1 | Habits | streak cards, `+` banks (+10 XP / +2 gold / 200 dmg), `−` undoes, inline add with category inference |
| 2 | Dailies | resetting checklist (+20 / +5 / 500), untick reverses cleanly, drives the perfect-day flag |
| 3 | Todos | one-time quests (+50 / +15 / 1000), completed fold into their own section |
| 4 | Legends | 8 archetypes, stat bars, aura rings, selection propagates everywhere |
| 5 | Character | gear grid, vitals, 5 stat bars, canvas radar, weekly XP trend |
| 6 | Boss Raid | 10,000 HP dragon, Cast Ultimate (10 MP / 1,500 dmg), Revive Boss, party roster |
| 7 | Achievements | 25 entries, 4 rarity tiers, locked show `???`, filters, progress bar |
| 8 | Calendar | month heatmap in 5 XP shades, day-detail dialog, month nav |
| 9 | Analytics | 6 metrics, 30-day XP line, 14-day habit bars, category donut, JSON/CSV export |
| 10 | Settings | theme, accent, zoom, animations, sound+volume, haptics, week start, data, about |
| 11 | Leaderboard | local hunter profiles, add dialog, sort by XP/level/streak/gold, active badge |
| 12 | Licenses | 10 attributions + the original-character disclaimer |

---

## Data

```
momentum.v5.state   version, gold, hp/hpMax, mp/mpMax, xp/xpMax, level,
                    bossHp/bossHpMax/bossDefeated/bossKills, hero,
                    habits[], dailies[], todos[], achievements[],
                    achievementDates{}, aliases[], activeAliasId,
                    xpByDay{}, habitsByDay{}, bossDamageByDay{}, dailiesByDay{},
                    perfectDays[], totals{}, flags{}, lastActiveDay, sessionStart
momentum.v5.prefs   theme, accent, zoom, sound, volume, animations, haptics,
                    notifications, weekStartsOn, reducedMotion
```

`loadState()` merges any older save forward field-by-field, so state written by
an earlier build never leaves a required field undefined. Settings → Data has
JSON export, JSON import and a double-confirmed clear.

---

## Game rules

| Action | XP | Gold | Boss damage |
|---|---|---|---|
| Habit `+` | +10 | +2 | 200 |
| Daily checked | +20 | +5 | 500 |
| Todo completed | +50 | +15 | 1000 |
| Cast Ultimate | — | — | 1500 (costs 10 MP) |

Level-up: `xpMax × 1.3`, `+10` max HP, `+5` max MP, pools refill.
Ranks: a new tier every 5 levels — E, D, C, B, A, S (S at level 26+).
Boss defeat: +500 gold, `bossKills + 1`, and the boss stays down until Revive.

---

## Accessibility

WCAG 2.1 AA was treated as a build requirement, not a polish pass:

- every muted text sample measures **≥ 7.9:1** on the dark background (the locked
  `--text-muted` token is 4.1:1, so a derived `--text-muted-strong` carries
  readable copy while the locked token stays defined for placeholders);
- skip link, semantic landmarks, `role="tab"` on all 12 tabs, `aria-label` on
  every icon-only button, `aria-live="polite"` for XP/level/boss announcements;
- dialogs are `aria-modal="true"` with a real focus trap and Esc to close;
- `prefers-reduced-motion` disables every animation, and the Settings toggle
  does the same thing by hand.

The contrast ratio is asserted numerically in `verify-v5.js`, so a palette
regression fails the suite rather than shipping.

---

## Known gaps

- **`icons/icon-192.png` and `icon-512.png` are not generated.** The manifests
  reference them; until they exist you get a 404 and the SVG favicon fallback.
  ```bash
  inkscape icons/icon.svg -w 192 -h 192 -o icons/icon-192.png
  inkscape icons/icon.svg -w 512 -h 512 -o icons/icon-512.png
  ```
- **The landing page's stat band and testimonials are illustrative** and the page
  says so in place. Replace them with measured numbers, or delete the section,
  before a public launch — presenting invented figures as real is false
  advertising.
- **Checkout is not wired.** Pro and Lifetime are labelled "Coming soon" and
  their buttons explain that rather than pretending to work.
- **No account system.** The nav Login button opens a dialog that says exactly
  that, instead of linking nowhere.
- **Cloud sync does not exist.** The app's Account section is a disabled button
  for the same reason.
