import {
  db,
  localDateKey,
  getAllWorkouts,
  addWorkout,
  updateWorkout,
  deleteWorkout,
  getSetting,
  setSetting,
  sessionSeconds,
  activeSeconds,
  formatDuration,
  formatClock,
  minToSec
} from './db.js'
import { PLANS, planRef } from './plan.js'
import { WorkoutTimer } from './timer.js'
import { icon } from './icons.js'

// Offline + auto-refresh. The service worker is plain JS at the site root (like
// expense-tracker), so GitHub Pages can serve this repo directly from main.
// When a newer sw.js takes control it messages this page and we reload.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NEW_VERSION') window.location.reload()
  })

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    const checkForUpdates = () => registration.update().catch(() => {})
    checkForUpdates()
    setInterval(checkForUpdates, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdates()
    })
    window.addEventListener('online', checkForUpdates)
  }).catch(() => {})
}

const app = document.getElementById('app')

function defaultForm() {
  return {
    type: 'interval',
    date: localDateKey(),
    circuits: 6,
    workMin: 1,
    sprintSec: 10,
    restMin: 3,
    warmupMin: 0,
    cooldownMin: 0,
    workLabel: 'Jog',
    restLabel: 'Walk',
    steadyMin: 40,
    notes: '',
    planRef: ''
  }
}

const state = {
  tab: 'log',
  workouts: [],
  settings: { sound: true, vibration: true },
  form: defaultForm(),
  timerForm: defaultForm(),
  editingId: null,
  filter: 'all',
  planWeeks: '6',
  expandedWeek: 1,
  timer: null,
  timerScreen: false,
  timerDone: null,
  timerSnapshot: null,
  showSettings: false,
  deferredPrompt: null,
  toast: ''
}

/* ---------- helpers ---------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

function fmtMinutes(minutes) {
  const total = Math.round((Number(minutes) || 0) * 60)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (!m) return `${s}s`
  return s ? `${m} min ${s}s` : `${m} min`
}

function fmtSeconds(seconds) {
  const s = Math.round(seconds || 0)
  return s < 60 ? `${s}s` : fmtMinutes(s / 60)
}

function formToWorkout(f, source = 'manual') {
  const isSteady = f.type === 'steady'
  const isSprint = f.type === 'sprints'
  return {
    date: f.date || localDateKey(),
    type: f.type,
    circuits: isSteady ? 0 : Math.max(1, Number(f.circuits) || 1),
    workSec: isSteady ? 0 : isSprint ? Math.max(1, Number(f.sprintSec) || 10) : minToSec(f.workMin),
    restSec: isSteady ? 0 : minToSec(f.restMin),
    warmupSec: isSteady ? 0 : minToSec(f.warmupMin),
    cooldownSec: isSteady ? 0 : minToSec(f.cooldownMin),
    steadySec: isSteady ? minToSec(f.steadyMin) : 0,
    workLabel: isSprint ? 'Sprint' : isSteady ? 'Run' : f.workLabel || 'Jog',
    restLabel: isSteady ? 'Walk' : isSprint ? 'Easy jog' : f.restLabel || 'Walk',
    notes: (f.notes || '').trim(),
    planRef: f.planRef || '',
    source
  }
}

function workoutToForm(w) {
  return {
    ...defaultForm(),
    type: w.type,
    circuits: w.circuits || 1,
    workMin: (w.workSec || 0) / 60,
    sprintSec: w.workSec || 10,
    restMin: (w.restSec || 0) / 60,
    warmupMin: (w.warmupSec || 0) / 60,
    cooldownMin: (w.cooldownSec || 0) / 60,
    steadyMin: (w.steadySec || 0) / 60,
    workLabel: w.workLabel || 'Jog',
    restLabel: w.restLabel || 'Walk',
    notes: w.note || w.notes || '',
    planRef: w.planRef || ''
  }
}

function timerConfigFrom(f) {
  if (f.type === 'steady') {
    return {
      type: 'steady',
      circuits: 1,
      workSec: Math.max(1, minToSec(f.steadyMin)),
      restSec: 0,
      warmupSec: 0,
      cooldownSec: 0,
      workLabel: 'Steady run',
      restLabel: 'Walk'
    }
  }
  return {
    type: f.type,
    circuits: Math.max(1, Number(f.circuits) || 1),
    workSec: f.type === 'sprints' ? Math.max(1, Number(f.sprintSec) || 10) : Math.max(1, minToSec(f.workMin)),
    restSec: minToSec(f.restMin),
    warmupSec: minToSec(f.warmupMin),
    cooldownSec: minToSec(f.cooldownMin),
    workLabel: f.type === 'sprints' ? 'Sprint' : f.workLabel || 'Jog',
    restLabel: f.type === 'sprints' ? 'Easy jog' : f.restLabel || 'Walk'
  }
}

function summaryText(f) {
  if (f.type === 'steady') {
    return `${fmtMinutes(f.steadyMin)} steady effort`
  }
  const sprint = f.type === 'sprints'
  const work = sprint
    ? `${Number(f.sprintSec) || 10}s ${f.workLabel || 'Sprint'}`
    : `${fmtMinutes(f.workMin)} ${f.workLabel || 'Jog'}`
  const rest = `${fmtMinutes(f.restMin)} ${f.restLabel || (sprint ? 'Easy jog' : 'Walk')}`
  const total = sessionSeconds(formToWorkout(f, 'preview'))
  return `${f.circuits || 0} rounds · ${work} / ${rest} · ${formatDuration(total)} total`
}

function describeWorkout(w) {
  if (w.type === 'steady') return `${formatDuration(w.steadySec)} steady`
  if (w.type === 'sprints') return `${w.circuits} × ${w.workSec}s ${w.workLabel || 'Sprint'}`
  return `${w.circuits} × ${fmtSeconds(w.workSec)} ${w.workLabel} / ${fmtSeconds(w.restSec)} ${w.restLabel}`
}

function dateLabel(key) {
  const today = localDateKey()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === today) return 'Today'
  if (key === localDateKey(yesterday)) return 'Yesterday'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function isoWeek(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - y0) / 86400000 + 1) / 7)
}

function toast(message) {
  state.toast = message
  const el = document.getElementById('toast')
  if (el) {
    el.textContent = message
    el.classList.add('show')
  }
  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    state.toast = ''
    const current = document.getElementById('toast')
    if (current) current.classList.remove('show')
  }, 2800)
}

/* ---------- audio / haptics ---------- */

let audioCtx = null

function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!audioCtx) audioCtx = new AC()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {
    audioCtx = null
  }
}

function playTone(kind) {
  if (!state.settings.sound) return
  primeAudio()
  if (!audioCtx) return
  const now = audioCtx.currentTime
  const notes =
    kind === 'work' ? [784, 1047] : kind === 'rest' ? [523, 392] : kind === 'done' ? [523, 659, 784, 1047] : [440]
  notes.forEach((freq, i) => {
    try {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const at = now + i * 0.15
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(at)
      osc.stop(at + 0.3)
    } catch {
      /* audio is a nice-to-have */
    }
  })
}

function vibrate(kind) {
  if (!state.settings.vibration || !navigator.vibrate) return
  if (kind === 'work') navigator.vibrate([300, 100, 300])
  else if (kind === 'rest') navigator.vibrate([150, 100, 150, 100, 150])
  else if (kind === 'done') navigator.vibrate([200, 100, 200, 100, 400])
  else navigator.vibrate([100])
}

function signal(kind) {
  playTone(kind)
  vibrate(kind)
}

let wakeLock = null
async function acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    wakeLock = null
  }
}
function releaseWakeLock() {
  try {
    wakeLock?.release()
  } catch {
    /* ignore */
  }
  wakeLock = null
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.timerScreen && !state.timerDone) acquireWakeLock()
})

/* ---------- timer wiring ---------- */

const timerHandlers = {
  onPhase: (phase, info) => {
    if (!info.isFirst) signal(phase.kind)
  },
  onCountdown: (remaining) => {
    if (remaining === 3) signal('soon')
  },
  onTick: (snapshot) => {
    state.timerSnapshot = snapshot
    updateTimerUI(snapshot)
  },
  onComplete: async (config) => {
    releaseWakeLock()
    signal('done')
    document.title = 'RunLoop — Run/Walk Tracker'
    await addWorkout(formToWorkout(state.timerForm, 'timer'))
    state.workouts = await getAllWorkouts()
    state.timerDone = { config, duration: config.circuits * (config.workSec + config.restSec) + config.warmupSec + config.cooldownSec }
    render()
  }
}

function startTimer() {
  const config = timerConfigFrom(state.timerForm)
  if (config.type !== 'steady' && (config.workSec < 1 || config.restSec < 0)) {
    toast('Check your interval times')
    return
  }
  primeAudio()
  acquireWakeLock()
  state.timerScreen = true
  state.timerDone = null
  state.timer = new WorkoutTimer(timerHandlers)
  state.timer.start(config)
  render()
}

/* ---------- render: shell ---------- */

function render() {
  const active = state.timerScreen && !state.timerDone
  app.innerHTML = `
    ${topbar()}
    <main class="view">${renderView()}</main>
    ${bottomNav()}
    ${state.showSettings ? settingsSheet() : ''}
    <div class="toast ${state.toast ? 'show' : ''}" id="toast">${esc(state.toast)}</div>
    ${state.timerScreen ? timerScreen() : ''}
  `
  if (active && state.timer) updateTimerUI(state.timer.snapshot())
}

function topbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${icon('bolt', 20)}</div>
        <div>
          <div class="brand-name">Run<span>Loop</span></div>
          <div class="brand-sub">Run · walk · repeat</div>
        </div>
      </div>
      <button class="topbar-btn" data-action="settings-open" aria-label="Settings">${icon('gear', 20)}</button>
    </header>
  `
}

const TABS = [
  { id: 'log', label: 'Log', ico: 'plus' },
  { id: 'timer', label: 'Timer', ico: 'timer' },
  { id: 'history', label: 'History', ico: 'history' },
  { id: 'stats', label: 'Stats', ico: 'chart' },
  { id: 'plan', label: 'Plan', ico: 'calendar' }
]

function bottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Main navigation">
      ${TABS.map(
        (t) => `<button class="${state.tab === t.id ? 'active' : ''}" data-action="tab" data-tab="${t.id}">
          ${icon(t.ico, 21)}<span>${t.label}</span>
        </button>`
      ).join('')}
    </nav>
  `
}

function renderView() {
  return {
    log: logView,
    timer: timerView,
    history: historyView,
    stats: statsView,
    plan: planView
  }[state.tab]()
}

/* ---------- render: log + timer setup ---------- */

function installBanner() {
  if (!state.deferredPrompt || state.tab !== 'log') return ''
  return `
    <div class="install-banner">
      ${icon('install', 20)}
      <span>Install RunLoop on your phone</span>
      <button data-action="install">Install</button>
    </div>
  `
}

function segmented(formKey, current) {
  return `
    <div class="segmented">
      <button class="${current === 'interval' ? 'active' : ''}" data-action="seg-type" data-form="${formKey}" data-type="interval">Intervals</button>
      <button class="${current === 'sprints' ? 'active' : ''}" data-action="seg-type" data-form="${formKey}" data-type="sprints">Sprints</button>
      <button class="${current === 'steady' ? 'active' : ''}" data-action="seg-type" data-form="${formKey}" data-type="steady">Steady</button>
    </div>
  `
}

function intervalPresets(formKey, f) {
  if (f.type === 'steady') return ''
  const chips =
    f.type === 'sprints'
      ? [
          [5, 10, 3, '5 × 10s'],
          [8, 10, 3, '8 × 10s'],
          [8, 15, 3, '8 × 15s'],
          [10, 15, 3, '10 × 15s']
        ]
      : [
          [6, 1, 3, '6 × 1/3'],
          [7, 1.5, 2.5, '7 × 1.5/2.5'],
          [7, 2, 2, '7 × 2/2'],
          [9, 1, 3, '9 × 1/3'],
          [9, 3.5, 0.5, '9 × 3.5/½']
        ]
  return `
    <div class="chips">
      ${chips
        .map(
          ([c, w, r, label]) => `<button class="chip ${
            Number(f.circuits) === c &&
            (f.type === 'sprints' ? Number(f.sprintSec) === w : Number(f.workMin) === w) &&
            Number(f.restMin) === r
              ? 'active'
              : ''
          }" data-action="preset" data-form="${formKey}" data-circuits="${c}" data-work="${w}" data-rest="${r}">${label}</button>`
        )
        .join('')}
    </div>
  `
}

function intervalFields(formKey, f) {
  if (f.type === 'steady') {
    return `
      <div class="field">
        <label>How long did you go? (minutes)</label>
        <input type="number" inputmode="decimal" min="1" step="1" data-form="${formKey}" data-field="steadyMin" value="${esc(f.steadyMin)}" />
      </div>
    `
  }
  const sprint = f.type === 'sprints'
  return `
    ${intervalPresets(formKey, f)}
    <div class="grid-3">
      <div class="field">
        <label>${sprint ? 'Reps' : 'Circuits'}</label>
        <input type="number" inputmode="numeric" min="1" step="1" data-form="${formKey}" data-field="circuits" value="${esc(f.circuits)}" />
      </div>
      <div class="field">
        <label>${sprint ? 'Sprint (sec)' : `${f.workLabel || 'Jog'} (min)`}</label>
        <input type="number" inputmode="decimal" min="1" ${sprint ? 'step="1"' : 'step="0.5"'} data-form="${formKey}" data-field="${sprint ? 'sprintSec' : 'workMin'}" value="${esc(sprint ? f.sprintSec : f.workMin)}" />
      </div>
      <div class="field">
        <label>${sprint ? 'Recover (min)' : `${f.restLabel || 'Walk'} (min)`}</label>
        <input type="number" inputmode="decimal" min="0" step="0.5" data-form="${formKey}" data-field="restMin" value="${esc(f.restMin)}" />
      </div>
    </div>
    <div class="grid-2">
      <div class="field">
        <label>Warm-up (min)</label>
        <input type="number" inputmode="decimal" min="0" step="0.5" data-form="${formKey}" data-field="warmupMin" value="${esc(f.warmupMin)}" />
      </div>
      <div class="field">
        <label>Cool-down (min)</label>
        <input type="number" inputmode="decimal" min="0" step="0.5" data-form="${formKey}" data-field="cooldownMin" value="${esc(f.cooldownMin)}" />
      </div>
    </div>
  `
}

function labelOptions(formKey, f) {
  if (f.type === 'steady') return ''
  return `
    <details class="options">
      <summary>Custom labels &amp; more options</summary>
      <div class="grid-2" style="margin-top:12px">
        <div class="field">
          <label>Hard part label</label>
          <input type="text" maxlength="14" data-form="${formKey}" data-field="workLabel" value="${esc(f.workLabel)}" />
        </div>
        <div class="field">
          <label>Easy part label</label>
          <input type="text" maxlength="14" data-form="${formKey}" data-field="restLabel" value="${esc(f.restLabel)}" />
        </div>
      </div>
    </details>
  `
}

function logView() {
  const f = state.form
  const todays = state.workouts.filter((w) => w.date === localDateKey())
  return `
    ${installBanner()}
    <h1 class="page-heading">Log a workout</h1>
    <p class="page-sub">Record what you actually did — the plan is a guide, not a rule.</p>

    ${
      state.editingId
        ? `<div class="card" style="display:flex;align-items:center;gap:10px;padding:12px">
            <strong style="flex:1;font-size:14px">Editing workout</strong>
            <button class="btn btn-ghost" data-action="clear-edit">Cancel</button>
          </div>`
        : ''
    }

    <div class="card">
      ${segmented('log', f.type)}
      <div class="field">
        <label>Date</label>
        <input type="date" data-form="log" data-field="date" value="${esc(f.date)}" />
      </div>
      ${intervalFields('log', f)}
      ${
        f.planRef
          ? `<div class="summary" style="justify-content:space-between">
              <span>From ${esc(f.planRef)}</span>
              <button class="btn btn-ghost" data-action="clear-planref" style="min-height:30px">Clear</button>
            </div>`
          : ''
      }
      <div class="field">
        <label>Notes (optional)</label>
        <textarea data-form="log" data-field="notes" placeholder="Felt good, pace easy, trails…">${esc(f.notes)}</textarea>
      </div>
      ${labelOptions('log', f)}
      <div class="summary">${icon('route', 16)} <span id="log-summary">${esc(summaryText(f))}</span></div>
      <button class="btn btn-primary" data-action="save-workout">${icon('check', 18)} ${state.editingId ? 'Save changes' : 'Save workout'}</button>
      <div style="height:10px"></div>
      <button class="btn btn-secondary" data-action="log-to-timer">${icon('timer', 18)} Use these settings in the timer</button>
    </div>

    <div class="section-head"><h2>Today</h2><span style="font-size:12px;color:var(--muted)">${todays.length} logged</span></div>
    ${
      todays.length
        ? todays.map((w) => workoutRow(w, true)).join('')
        : `<div class="empty"><strong>Nothing logged yet</strong>Your workouts will show up here.</div>`
    }
  `
}

function timerView() {
  const f = state.timerForm
  return `
    <h1 class="page-heading">Workout timer</h1>
    <p class="page-sub">A chime and a buzz tell you when to switch. Keep the phone nearby.</p>
    <div class="card">
      <div class="setup-note">${icon('vibration', 18)}
        <span>Sound and vibration are on by default. Turn them off any time in Settings. Your screen stays awake while the timer runs.</span>
      </div>
      ${segmented('timer', f.type)}
      ${intervalFields('timer', f)}
      ${labelOptions('timer', f)}
      <div class="summary">${icon('route', 16)} <span id="timer-summary">${esc(summaryText(f))}</span></div>
      <button class="btn btn-primary" data-action="timer-start">${icon('play', 18)} Start workout</button>
    </div>
  `
}

/* ---------- render: list rows ---------- */

function workoutRow(w, compact = false) {
  const badgeClass = `badge badge-${w.type}`
  const badgeText = { interval: 'Walk/Jog', sprints: 'Sprints', steady: 'Steady' }[w.type] || w.type
  const meta = `${formatDuration(sessionSeconds(w))} total · ${formatDuration(activeSeconds(w))} ${
    w.type === 'sprints' ? 'sprinting' : 'moving'
  }`
  return `
    <div class="workout-row">
      <div class="workout-icon">${icon(w.type === 'sprints' ? 'bolt' : 'route', 19)}</div>
      <div class="workout-main">
        <div class="workout-title"><span class="${badgeClass}">${badgeText}</span>${esc(describeWorkout(w))}</div>
        <div class="workout-meta">${esc(meta)}${w.source === 'timer' ? ' · timed' : ''}</div>
        ${
          !compact && w.notes
            ? `<div class="workout-note">${esc(w.notes)}</div>`
            : ''
        }
        ${!compact && w.planRef ? `<div class="workout-meta">${esc(w.planRef)}</div>` : ''}
      </div>
      <div class="workout-actions">
        <button class="icon-btn" data-action="edit-workout" data-id="${w.id}" aria-label="Edit">${icon('edit', 17)}</button>
        ${
          compact
            ? ''
            : `<button class="icon-btn" data-action="delete-workout" data-id="${w.id}" aria-label="Delete">${icon('trash', 17)}</button>`
        }
      </div>
    </div>
  `
}

/* ---------- render: history ---------- */

function historyView() {
  const filters = [
    ['all', 'All'],
    ['interval', 'Walk/Jog'],
    ['sprints', 'Sprints'],
    ['steady', 'Steady']
  ]
  const list = state.workouts.filter((w) => state.filter === 'all' || w.type === state.filter)
  const groups = new Map()
  for (const w of list) {
    if (!groups.has(w.date)) groups.set(w.date, [])
    groups.get(w.date).push(w)
  }

  return `
    <h1 class="page-heading">History</h1>
    <p class="page-sub">${state.workouts.length} workout${state.workouts.length === 1 ? '' : 's'} stored on this device.</p>
    <div class="chips">
      ${filters
        .map(
          ([id, label]) =>
            `<button class="chip ${state.filter === id ? 'active' : ''}" data-action="filter" data-filter="${id}">${label}</button>`
        )
        .join('')}
    </div>
    ${
      list.length
        ? [...groups.entries()]
            .map(
              ([date, items]) => `
              <div class="date-group">
                <p class="date-label">${esc(dateLabel(date))}</p>
                ${items.map((w) => workoutRow(w)).join('')}
              </div>`
            )
            .join('')
        : `<div class="empty"><strong>No workouts here yet</strong>Log one from the Log tab, or follow a day in the Plan tab.</div>`
    }
  `
}

/* ---------- render: stats ---------- */

function statsView() {
  const workouts = state.workouts
  const totalSec = workouts.reduce((s, w) => s + sessionSeconds(w), 0)
  const activeSec = workouts.reduce((s, w) => s + activeSeconds(w), 0)
  const days = new Set(workouts.map((w) => w.date))
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(localDateKey(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const weeks = []
  const monday = new Date()
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday)
    start.setDate(start.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const minutes =
      workouts
        .filter((w) => {
          const d = new Date(`${w.date}T12:00:00`)
          return d >= start && d < end
        })
        .reduce((s, w) => s + sessionSeconds(w), 0) / 60
    weeks.push({ label: `W${isoWeek(start)}`, minutes })
  }
  const maxMinutes = Math.max(10, ...weeks.map((w) => w.minutes))

  const counts = {
    interval: workouts.filter((w) => w.type === 'interval').length,
    sprints: workouts.filter((w) => w.type === 'sprints').length,
    steady: workouts.filter((w) => w.type === 'steady').length
  }
  const total = workouts.length || 1
  const mix = [
    ['interval', '#e2623c'],
    ['sprints', '#a259d9'],
    ['steady', '#d99a1c']
  ]

  return `
    <h1 class="page-heading">Stats</h1>
    <p class="page-sub">Every log adds up — here's the big picture.</p>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon">${icon('check', 20)}</div><div class="stat-value">${workouts.length}</div><div class="stat-label">Workouts logged</div></div>
      <div class="stat-card"><div class="stat-icon">${icon('clock', 20)}</div><div class="stat-value">${formatDuration(totalSec)}</div><div class="stat-label">Total time out</div></div>
      <div class="stat-card"><div class="stat-icon">${icon('flame', 20)}</div><div class="stat-value">${streak} ${streak === 1 ? 'day' : 'days'}</div><div class="stat-label">Current streak</div></div>
      <div class="stat-card"><div class="stat-icon">${icon('bolt', 20)}</div><div class="stat-value">${formatDuration(activeSec)}</div><div class="stat-label">Time jogging/sprinting</div></div>
    </div>

    <div class="card">
      <p class="card-title">Last 8 weeks</p>
      <p class="card-sub">Minutes per week, including walks</p>
      <div class="chart">
        ${weeks
          .map(
            (w) => `
            <div class="bar-col">
              <span class="bar-value">${w.minutes ? Math.round(w.minutes) : ''}</span>
              <div class="bar-track"><div class="bar-fill" style="height:${Math.max(2, (w.minutes / maxMinutes) * 100)}%"></div></div>
              <span class="bar-label">${w.label}</span>
            </div>`
          )
          .join('')}
      </div>
    </div>

    <div class="card">
      <p class="card-title">Workout mix</p>
      <p class="card-sub">How your training is split</p>
      <div class="mix-bar">
        ${mix
          .map(
            ([type, color]) =>
              `<div class="mix-seg" style="width:${(counts[type] / total) * 100}%;background:${color}"></div>`
          )
          .join('')}
      </div>
      <div class="legend">
        ${mix
          .map(
            ([type, color]) =>
              `<span><i class="dot" style="background:${color}"></i>${{ interval: 'Walk/Jog', sprints: 'Sprints', steady: 'Steady' }[type]} ${counts[type]}</span>`
          )
          .join('')}
      </div>
    </div>
  `
}

/* ---------- render: plan ---------- */

function planView() {
  const weeks = PLANS[state.planWeeks]
  return `
    <h1 class="page-heading">Training plan</h1>
    <p class="page-sub">From the Mottiv beginner guide. Tap “Log” to copy a day into your log, then edit anything you like.</p>
    <div class="plan-tabs">
      ${['4', '6', '8']
        .map(
          (n) =>
            `<button class="${state.planWeeks === n ? 'active' : ''}" data-action="plan-weeks" data-weeks="${n}">${n} weeks</button>`
        )
        .join('')}
    </div>
    ${weeks
      .map((w, wi) => {
        const open = state.expandedWeek === w.week
        return `
        <div class="week-card ${open ? 'open' : ''}">
          <button class="week-head" data-action="toggle-week" data-week="${w.week}">
            ${icon('calendar', 18)} Week ${w.week}
            <span class="chev">${icon('chevron', 18)}</span>
          </button>
          ${
            open
              ? w.days
                  .map((d, di) => {
                    const ref = planRef(state.planWeeks, w.week, d.day)
                    const done = state.workouts.some((x) => x.planRef === ref)
                    return `
                    <div class="day-row ${d.type === 'rest' ? 'rest' : ''}">
                      <div class="day-name">${d.day.slice(0, 3)}</div>
                      <div class="day-main">
                        <div class="day-title">${esc(d.title)}${done ? ' ✓' : ''}</div>
                        <div class="day-detail">${esc(d.detail)}</div>
                      </div>
                      ${
                        d.type === 'rest'
                          ? ''
                          : `<button class="day-log" data-action="plan-log" data-week="${wi}" data-day="${di}">Log</button>`
                      }
                    </div>`
                  })
                  .join('')
              : ''
          }
        </div>`
      })
      .join('')}
    <div class="setup-note">${icon('info', 18)}
      <span>Goal: run continuously for 30 minutes. Your own circuits can be any length — this is just a reference.</span>
    </div>
  `
}

/* ---------- render: settings sheet ---------- */

function settingsSheet() {
  return `
    <div class="sheet-backdrop" data-action="settings-backdrop">
      <div class="sheet" data-sheet>
        <div class="sheet-grip"></div>
        <div class="sheet-head">
          <h2>Settings</h2>
          <button class="topbar-btn" data-action="settings-close" aria-label="Close">${icon('close', 20)}</button>
        </div>

        <div class="setting-row">
          <span class="setting-icon">${icon('volume', 20)}</span>
          <div class="setting-text"><strong>Sound cues</strong><small>Chime when it's time to switch</small></div>
          <button class="switch ${state.settings.sound ? 'on' : ''}" data-action="toggle-sound" aria-label="Toggle sound"></button>
        </div>
        <div class="setting-row">
          <span class="setting-icon">${icon('vibration', 20)}</span>
          <div class="setting-text"><strong>Vibration</strong><small>Buzz on every phase change</small></div>
          <button class="switch ${state.settings.vibration ? 'on' : ''}" data-action="toggle-vibration" aria-label="Toggle vibration"></button>
        </div>

        <div style="height:14px"></div>
        <div class="card" style="box-shadow:none">
          <p class="card-title">Your data</p>
          <p class="card-sub">Everything is stored offline on this device. Back it up as a JSON file.</p>
          <button class="btn btn-secondary" data-action="export" style="margin-bottom:10px">${icon('download', 18)} Export backup</button>
          <button class="btn btn-secondary" data-action="import" style="margin-bottom:10px">${icon('upload', 18)} Import backup</button>
          <input type="file" id="import-file" accept="application/json,.json" style="display:none" />
          <button class="btn btn-danger" data-action="clear-all">${icon('trash', 18)} Delete all workouts</button>
        </div>

        <div class="card" style="box-shadow:none">
          <p class="card-title">Install on Android</p>
          <p class="card-sub">Open in Chrome → menu ⋮ → “Install app” or “Add to Home screen”. Then it works offline, full-screen.</p>
          ${
            state.deferredPrompt
              ? `<button class="btn btn-primary" data-action="install">${icon('install', 18)} Install RunLoop</button>`
              : ''
          }
        </div>
        <p style="text-align:center;color:var(--muted);font-size:11px;margin:18px 0 0">RunLoop v1.0 · Built for the Mottiv run/walk plan</p>
      </div>
    </div>
  `
}

/* ---------- render: full-screen timer ---------- */

function timerScreen() {
  if (state.timerDone) {
    return `
      <div class="timer-screen">
        <div class="timer-inner">
          <div class="timer-top"><div class="brand-name">Run<span>Loop</span></div></div>
          <div class="timer-body">
            <div class="phase-pill other">${icon('check', 15)} Workout complete</div>
            <div class="timer-time">${formatClock(state.timerDone.duration)}</div>
            <div class="timer-round">Saved to your history</div>
            <div class="timer-next">${state.timerDone.config.circuits} rounds · ${fmtSeconds(
              state.timerDone.config.workSec
            )} hard / ${fmtSeconds(state.timerDone.config.restSec)} easy</div>
          </div>
          <button class="btn btn-primary" data-action="timer-back" style="background:#a8e6c4;color:#0e1512">Back to app</button>
          <div class="timer-hint">Nice work. Your streak just got a little stronger.</div>
        </div>
      </div>
    `
  }

  const snap = state.timer?.snapshot() || null
  const kind = snap?.phase.kind || 'work'
  return `
    <div class="timer-screen">
      <div class="timer-inner">
        <div class="timer-top">
          <div class="brand-name">Run<span>Loop</span></div>
          <button class="timer-close" data-action="timer-finish" aria-label="End workout">${icon('close', 20)}</button>
        </div>
        <div class="timer-body">
          <div class="phase-pill ${kind}" id="phase-pill">
            ${icon(kind === 'work' ? 'bolt' : kind === 'rest' ? 'route' : 'timer', 15)}
            <span id="phase-text">${esc(snap?.phase.label || 'Get ready')}</span>
          </div>
          <div class="timer-time" id="timer-time">${formatClock(snap?.remaining || 0)}</div>
          <div class="timer-round" id="timer-round"></div>
          <div class="timer-next" id="timer-next"></div>
          <div class="progress"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
          <div class="progress-labels"><span id="progress-elapsed">00:00</span><span id="progress-total">00:00</span></div>
          <div class="timer-controls">
            <button class="timer-btn" data-action="timer-skip" aria-label="Skip phase">${icon('skip', 22)}</button>
            <button class="timer-btn main" data-action="timer-pause" id="pause-btn">${icon('pause', 18)} Pause</button>
          </div>
          <div class="timer-hint">Pause, skip a phase, or close to end without saving.</div>
        </div>
      </div>
    </div>
  `
}

function updateTimerUI(snap) {
  if (!snap || state.timerDone) return
  const pill = document.getElementById('phase-pill')
  if (!pill) return
  pill.className = `phase-pill ${snap.phase.kind}`
  document.getElementById('phase-text').textContent = snap.phase.label
  document.getElementById('timer-time').textContent = formatClock(snap.remaining)
  document.getElementById('timer-round').textContent =
    snap.round > 0 ? `Round ${snap.round} of ${snap.rounds}` : `${snap.phase.label} — get ready`
  const next = state.timer?.queue[snap.index + 1]
  document.getElementById('timer-next').textContent = next
    ? `Next: ${next.label} · ${formatClock(next.sec)}`
    : 'Final stretch — finish strong!'
  document.getElementById('progress-fill').style.width = `${snap.sessionProgress * 100}%`
  document.getElementById('progress-elapsed').textContent = formatClock(snap.elapsedSec)
  document.getElementById('progress-total').textContent = formatClock(snap.totalSec)
  const pauseBtn = document.getElementById('pause-btn')
  if (pauseBtn) {
    pauseBtn.innerHTML = snap.state === 'paused' ? `${icon('play', 18)} Resume` : `${icon('pause', 18)} Pause`
  }
  document.title = `${formatClock(snap.remaining)} · ${snap.phase.label} — RunLoop`
}

/* ---------- events ---------- */

app.addEventListener('input', (e) => {
  const el = e.target
  if (!el.dataset.field) return
  const target = el.dataset.form === 'timer' ? state.timerForm : state.form
  target[el.dataset.field] = el.type === 'number' ? Number(el.value) : el.value
  const summaryId = el.dataset.form === 'timer' ? 'timer-summary' : 'log-summary'
  const summary = document.getElementById(summaryId)
  if (summary) summary.textContent = summaryText(target)
})

app.addEventListener('change', async (e) => {
  if (e.target.id !== 'import-file') return
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!Array.isArray(data.workouts)) throw new Error('Bad backup file')
    const ok = confirm(
      `Replace your ${state.workouts.length} workouts with ${data.workouts.length} from this backup?`
    )
    if (!ok) return
    await db.transaction('rw', db.workouts, db.settings, async () => {
      await db.workouts.clear()
      await db.workouts.bulkAdd(
        data.workouts.map(({ id, ...rest }) => ({ ...rest, createdAt: rest.createdAt || Date.now() }))
      )
      if (data.settings) {
        await db.settings.put({ key: 'sound', value: !!data.settings.sound })
        await db.settings.put({ key: 'vibration', value: !!data.settings.vibration })
      }
    })
    state.workouts = await getAllWorkouts()
    state.settings = {
      sound: await getSetting('sound', true),
      vibration: await getSetting('vibration', true)
    }
    render()
    toast(`Restored ${state.workouts.length} workouts`)
  } catch (err) {
    toast('Could not read that backup file')
  } finally {
    e.target.value = ''
  }
})

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const { action } = btn.dataset
  const form = btn.dataset.form === 'timer' ? state.timerForm : state.form

  switch (action) {
    case 'tab':
      state.tab = btn.dataset.tab
      render()
      window.scrollTo(0, 0)
      break

    case 'settings-open':
      state.showSettings = true
      render()
      break

    case 'settings-close':
    case 'settings-backdrop':
      if (action === 'settings-backdrop' && e.target !== btn) return
      state.showSettings = false
      render()
      break

    case 'seg-type': {
      form.type = btn.dataset.type
      if (form.type === 'sprints') {
        form.workLabel = 'Sprint'
        form.restLabel = 'Easy jog'
      }
      if (form.type === 'interval') {
        form.workLabel = 'Jog'
        form.restLabel = 'Walk'
      }
      render()
      break
    }

    case 'preset': {
      form.circuits = Number(btn.dataset.circuits)
      form.restMin = Number(btn.dataset.rest)
      if (form.type === 'sprints') form.sprintSec = Number(btn.dataset.work)
      else form.workMin = Number(btn.dataset.work)
      render()
      break
    }

    case 'clear-planref':
      state.form.planRef = ''
      render()
      break

    case 'save-workout': {
      const workout = formToWorkout(state.form, 'manual')
      if (state.editingId) {
        await updateWorkout(Number(state.editingId), workout)
        state.editingId = null
        toast('Workout updated')
      } else {
        await addWorkout(workout)
        toast('Workout saved')
      }
      state.form = defaultForm()
      state.workouts = await getAllWorkouts()
      render()
      break
    }

    case 'edit-workout': {
      const w = state.workouts.find((x) => x.id === Number(btn.dataset.id))
      if (!w) return
      state.form = { ...workoutToForm(w), date: w.date }
      state.editingId = w.id
      state.tab = 'log'
      render()
      window.scrollTo(0, 0)
      break
    }

    case 'delete-workout': {
      const id = Number(btn.dataset.id)
      if (!confirm('Delete this workout? This cannot be undone.')) return
      await deleteWorkout(id)
      if (state.editingId === id) state.editingId = null
      state.workouts = await getAllWorkouts()
      render()
      toast('Workout deleted')
      break
    }

    case 'clear-edit':
      state.editingId = null
      state.form = defaultForm()
      render()
      break

    case 'log-to-timer':
      state.timerForm = { ...state.form }
      state.tab = 'timer'
      render()
      window.scrollTo(0, 0)
      break

    case 'filter':
      state.filter = btn.dataset.filter
      render()
      break

    case 'plan-weeks':
      state.planWeeks = btn.dataset.weeks
      state.expandedWeek = 1
      render()
      break

    case 'toggle-week':
      state.expandedWeek = state.expandedWeek === Number(btn.dataset.week) ? 0 : Number(btn.dataset.week)
      render()
      break

    case 'plan-log': {
      const day = PLANS[state.planWeeks][Number(btn.dataset.week)].days[Number(btn.dataset.day)]
      state.form = workoutToForm(day)
      state.form.planRef = planRef(state.planWeeks, PLANS[state.planWeeks][Number(btn.dataset.week)].week, day.day)
      state.editingId = null
      state.tab = 'log'
      render()
      window.scrollTo(0, 0)
      toast('Check the details, then save')
      break
    }

    case 'toggle-sound':
      state.settings.sound = !state.settings.sound
      await setSetting('sound', state.settings.sound)
      if (state.settings.sound) playTone('soon')
      render()
      break

    case 'toggle-vibration':
      state.settings.vibration = !state.settings.vibration
      await setSetting('vibration', state.settings.vibration)
      if (state.settings.vibration) vibrate('soon')
      render()
      break

    case 'export': {
      const payload = {
        app: 'RunLoop',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        workouts: state.workouts
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `runloop-backup-${localDateKey()}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('Backup downloaded')
      break
    }

    case 'import':
      document.getElementById('import-file')?.click()
      break

    case 'clear-all': {
      if (!confirm('Delete ALL workouts and settings on this device? This cannot be undone.')) return
      if (!confirm('Are you sure? Your data will be gone.')) return
      await db.workouts.clear()
      await db.settings.clear()
      state.workouts = []
      state.settings = { sound: true, vibration: true }
      state.showSettings = false
      render()
      toast('All data cleared')
      break
    }

    case 'install':
      if (!state.deferredPrompt) return
      state.deferredPrompt.prompt()
      await state.deferredPrompt.userChoice
      state.deferredPrompt = null
      render()
      break

    case 'timer-start':
      startTimer()
      break

    case 'timer-pause':
      if (state.timer?.state === 'running') state.timer.pause()
      else state.timer?.resume()
      break

    case 'timer-skip':
      state.timer?.skip()
      break

    case 'timer-finish':
      if (!confirm('End this workout? It will not be saved.')) return
      state.timer?.stop()
      releaseWakeLock()
      state.timerScreen = false
      state.timerDone = null
      state.timerSnapshot = null
      document.title = 'RunLoop — Run/Walk Tracker'
      render()
      toast('Workout ended — not saved')
      break

    case 'timer-back':
      state.timerScreen = false
      state.timerDone = null
      state.timerSnapshot = null
      state.tab = 'history'
      render()
      window.scrollTo(0, 0)
      break
  }
})

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  state.deferredPrompt = e
  if (state.tab === 'log' && !state.timerScreen) render()
})

/* ---------- boot ---------- */

async function init() {
  state.settings = {
    sound: await getSetting('sound', true),
    vibration: await getSetting('vibration', true)
  }
  state.workouts = await getAllWorkouts()
  render()
}

init()
