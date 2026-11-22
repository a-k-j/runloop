// Beginner run/walk plan adapted from the Mottiv "How to Start Running" guide:
// https://www.mymottiv.com/blog/how-to-start-running
// Times are kept as seconds internally; the labels mirror the article.

const sec = (minutes) => Math.round(minutes * 60)

function fmtMin(minutes) {
  const total = sec(minutes)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (!m) return `${s} sec`
  return s ? `${m} min ${s}s` : `${m} min`
}

const rest = (day) => ({
  type: 'rest',
  day,
  title: 'Rest day',
  detail: 'Recover. A gentle walk is fine.',
  circuits: 0,
  workSec: 0,
  restSec: 0,
  warmupSec: 0,
  cooldownSec: 0,
  note: ''
})

function interval(day, circuits, workMin, walkMin) {
  return {
    type: 'interval',
    day,
    title: 'Walk/Jog Intervals',
    detail: `${circuits} × ${fmtMin(workMin)} jog, ${fmtMin(walkMin)} walk`,
    circuits,
    workLabel: 'Jog',
    restLabel: 'Walk',
    workSec: sec(workMin),
    restSec: sec(walkMin),
    warmupSec: 0,
    cooldownSec: 0,
    note: ''
  }
}

function sprint(day, reps, seconds) {
  return {
    type: 'sprints',
    day,
    title: 'Sprints',
    detail: `${reps} × ${seconds}s fast · 2–4 min easy jog recovery`,
    circuits: reps,
    workLabel: 'Sprint',
    restLabel: 'Easy jog',
    workSec: seconds,
    restSec: 180,
    warmupSec: 300,
    cooldownSec: 300,
    note: 'Warm up 5 min, cool down 5 min.'
  }
}

function steady(day, minutes, note = 'Strong hike / brisk walk') {
  return {
    type: 'steady',
    day,
    title: 'Steady Hike/Jog',
    detail: `${minutes} min ${note === 'Strong hike / brisk walk' ? note.toLowerCase() : `strong hike/brisk walk (${note.toLowerCase()})`}`,
    steadySec: sec(minutes),
    note: note === 'Strong hike / brisk walk' ? '' : note
  }
}

function week(n, mon, wed, fri, sun) {
  return {
    week: n,
    days: [
      mon,
      rest('Tuesday'),
      wed,
      rest('Thursday'),
      fri,
      rest('Saturday'),
      sun
    ]
  }
}

const sixWeek = [
  week(
    1,
    interval('Monday', 6, 1, 3),
    sprint('Wednesday', 5, 10),
    interval('Friday', 7, 1, 3),
    steady('Sunday', 30)
  ),
  week(
    2,
    interval('Monday', 6, 1.5, 2.5),
    sprint('Wednesday', 6, 10),
    interval('Friday', 7, 1.5, 2.5),
    steady('Sunday', 35)
  ),
  week(
    3,
    interval('Monday', 6, 2, 2),
    sprint('Wednesday', 7, 10),
    interval('Friday', 7, 2, 2),
    steady('Sunday', 40)
  ),
  week(
    4,
    interval('Monday', 6, 2.5, 1.5),
    sprint('Wednesday', 8, 10),
    interval('Friday', 7, 2.5, 1.5),
    steady('Sunday', 40, 'Jog the final 5 minutes')
  ),
  week(
    5,
    interval('Monday', 6, 3, 1),
    sprint('Wednesday', 5, 15),
    interval('Friday', 7, 3, 1),
    steady('Sunday', 40, 'Jog the final 7 minutes')
  ),
  week(
    6,
    interval('Monday', 6, 3.5, 0.5),
    sprint('Wednesday', 6, 15),
    interval('Friday', 7, 3.5, 0.5),
    steady('Sunday', 40, 'Jog the final 10 minutes')
  )
]

export const PLANS = {
  '6': sixWeek,
  '4': [
    week(
      1,
      interval('Monday', 6, 1, 3),
      sprint('Wednesday', 6, 10),
      interval('Friday', 7, 1, 3),
      steady('Sunday', 40, 'Jog the final 5 minutes')
    ),
    week(
      2,
      interval('Monday', 6, 2, 2),
      sprint('Wednesday', 8, 10),
      interval('Friday', 7, 2, 2),
      steady('Sunday', 45, 'Jog the final 10 minutes')
    ),
    week(
      3,
      interval('Monday', 7, 2, 2),
      sprint('Wednesday', 8, 15),
      interval('Friday', 8, 3, 1),
      steady('Sunday', 45, 'Jog the final 15 minutes')
    ),
    week(
      4,
      interval('Monday', 8, 3, 1),
      sprint('Wednesday', 10, 15),
      interval('Friday', 9, 3.5, 0.5),
      steady('Sunday', 50, 'Jog the final 20 minutes')
    )
  ],
  '8': [
    ...sixWeek,
    week(
      7,
      interval('Monday', 7, 3.5, 0.5),
      sprint('Wednesday', 7, 15),
      interval('Friday', 8, 3.5, 0.5),
      steady('Sunday', 45, 'Jog the final 10 minutes')
    ),
    week(
      8,
      interval('Monday', 8, 3.5, 0.5),
      sprint('Wednesday', 8, 15),
      interval('Friday', 9, 3.5, 0.5),
      steady('Sunday', 45, 'Jog the final 15 minutes')
    )
  ]
}

export function planRef(planWeeks, weekNumber, day) {
  return `${planWeeks}-week · Week ${weekNumber} · ${day}`
}
