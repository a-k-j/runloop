// Dexie is loaded as a UMD script in index.html (vendor/dexie.min.js), so this
// static site needs no bundler or npm install.
const Dexie = window.Dexie

export const db = new Dexie('runloop-db')

db.version(1).stores({
  workouts: '++id, date, type, createdAt, source',
  settings: 'key'
})

/** YYYY-MM-DD in the device's local timezone (not UTC). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function getAllWorkouts() {
  const all = await db.workouts.toArray()
  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

export async function addWorkout(workout) {
  return db.workouts.add({ ...workout, createdAt: Date.now() })
}

export async function updateWorkout(id, changes) {
  return db.workouts.update(id, changes)
}

export async function deleteWorkout(id) {
  return db.workouts.delete(id)
}

export async function getSetting(key, fallback) {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : row.value
}

export async function setSetting(key, value) {
  return db.settings.put({ key, value })
}

/** Total elapsed time of a session, including warm-up and cool-down. */
export function sessionSeconds(w) {
  if (w.type === 'steady') return w.steadySec || 0
  return (
    (w.circuits || 0) * ((w.workSec || 0) + (w.restSec || 0)) +
    (w.warmupSec || 0) +
    (w.cooldownSec || 0)
  )
}

/** Time actually spent jogging / sprinting. */
export function activeSeconds(w) {
  if (w.type === 'steady') return w.steadySec || 0
  return (w.circuits || 0) * (w.workSec || 0)
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatMinutesShort(seconds) {
  return `${Math.round((seconds || 0) / 60)}m`
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function minToSec(minutes) {
  return Math.round((Number(minutes) || 0) * 60)
}
