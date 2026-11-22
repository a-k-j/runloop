# RunLoop

A small offline-first PWA for tracking run/walk workouts, inspired by the
[Mottiv beginner running plan](https://www.mymottiv.com/blog/how-to-start-running#training-plan-content--2).
You don't have to follow the plan exactly — log whatever you actually did, e.g.
**9 circuits of 1 min jog / 3 min walk**.

Built like `expense-tracker`: plain HTML/CSS/JS at the repo root, relative paths,
Dexie from a local UMD file, and a hand-written service worker. No bundler, no
build step — GitHub Pages serves the `main` branch directly.

## Features

- **Quick log** — circuits, jog/walk minutes, sprint reps, steady runs, warm-up/cool-down, notes, date.
  Preset chips for common intervals, plus editable labels ("Jog"/"Walk", "Sprint"/"Easy jog").
- **Live timer** — guided countdown with big phase display, round progress, pause and skip.
  It **vibrates and plays a chime on every phase change**, plus a short cue 3 seconds before a switch.
  The screen stays awake while it runs (Wake Lock API, where supported). Finished sessions save automatically.
- **History & stats** — workouts grouped by day, filters, total time, jogging time, current streak,
  an 8-week bar chart, and workout mix.
- **Plan reference** — built-in 4-, 6- and 8-week versions of the Mottiv schedule (Mon/Wed/Fri/Sun).
  Tap **Log** on any day to copy it into the form and edit it.
- **Backup** — export all workouts and settings to a JSON file, and restore from it later.
- **Offline** — all data lives in IndexedDB via Dexie.js; the service worker precaches every file.
  No account, no server, no tracking.
- **Auto-refresh** — the service worker checks for new code on startup, when the app returns to the
  foreground, when the network comes back, and every 5 minutes. When a newer version activates it
  reloads open tabs automatically.

## Run locally

No `npm install` needed:

```bash
npm run dev
# open http://localhost:5173
```

Or serve the folder with any static server, e.g. `python3 -m http.server 5173`.

## Deploy (GitHub Pages)

This repo is already configured with Pages → **Deploy from a branch: `main` / root**.
Just push to `main` and the site updates at:

**https://a-k-j.github.io/runloop/**

All paths in the app are relative (`./...`), so it works from a subpath without any
base-path configuration.

### After changing code

Bump `CACHE_VERSION` in `sw.js` (e.g. `v2` → `v3`) and commit it. On the next check
the new service worker installs, deletes the old cache, takes control and tells the
open page to reload — so nobody keeps running stale code.

## Where data is stored

- Workouts and settings: IndexedDB database `runloop-db` (Dexie.js), on the device only.
- Sound/vibration preferences: same database, `settings` store.

Export a backup before clearing browser data or reinstalling the app.

## Icons

The PWA icons are generated from `scripts/generate-icons.py` (requires Pillow):

```bash
python3 scripts/generate-icons.py
```
