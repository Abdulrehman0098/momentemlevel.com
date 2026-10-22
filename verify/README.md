# Momentum web build — verification harness

`verify-v4.js` drives the real `index.html` in headless Chromium and asserts the
V4.0.5 spec: HUD meters, the 7 tabs, the reward numbers, the level-up cinematic,
the canvas charts, the party roster, persistence, and the phone layout.

It serves the site itself, so nothing else needs to be running.

## Run it

```bash
cd D:/src/momentum-site/verify
npm install playwright-core        # once; a local Chrome also works
node verify-v4.js
```

Exit code is `0` when every check passes. Override the defaults with
`SITE_ROOT`, `PORT` or `CHROME_EXE` if your paths differ.

The last full run: **68 / 68 checks passed**.

## Note

This folder is a development tool, not part of the shipped page — the site
itself is still the single `index.html` with no build step. Delete the folder
if you do not want it in the repo.
