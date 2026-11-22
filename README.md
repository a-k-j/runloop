# RunLoop

A small offline-first PWA for tracking run/walk workouts, inspired by the
[Mottiv beginner running plan](https://www.mymottiv.com/blog/how-to-start-running#training-plan-content--2).
You don't have to follow the plan exactly — log whatever you actually did, e.g.
**9 circuits of 1 min jog / 3 min walk**.

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
- **Offline** — all data lives in IndexedDB via Dexie.js; the app shell is precached by a service worker.
  No account, no server, no tracking.
- **Auto-refresh** — the service worker checks for new code on startup, when the app returns to the
  foreground, when the network comes back, and every 5 minutes. When a new build takes control,
  the app reloads itself automatically, so an open tab never keeps running stale code.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build and local preview:

```bash
npm run build
npm run preview
```

## Install on Android

1. Serve the app over HTTPS (or use `localhost` during development) — service workers require a secure context.
2. Open it in Chrome, then use the menu **⋮ → Install app** (or **Add to Home screen**).
3. Launch it from the home screen: it runs full-screen and works offline.

An **Install** button also appears on the Log tab and in Settings when the browser supports it.

To put the production build online, upload the contents of `dist/` to any static host
(Netlify, Vercel, GitHub Pages, your own server). The generated `sw.js`, `manifest.webmanifest`
and `icons/` must stay at the site root.

## Where data is stored

- Workouts and settings: IndexedDB database `runloop-db` (Dexie.js), on the device only.
- Sound/vibration preferences: same database, `settings` store.

Export a backup before clearing browser data or reinstalling the app.

## Icons

The PWA icons are generated from `scripts/generate-icons.py` (requires Pillow):

```bash
python3 scripts/generate-icons.py
```
