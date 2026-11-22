/**
 * Deadline-based interval timer. All phase changes are derived from wall-clock
 * elapsed time, so a throttled background tab cannot make the session drift.
 */
export class WorkoutTimer {
  constructor(handlers = {}) {
    this.handlers = handlers
    this.state = 'idle'
    this.queue = []
    this.intervalId = null
  }

  buildQueue(config) {
    const q = []
    if (config.warmupSec > 0) {
      q.push({ kind: 'warmup', label: 'Warm up', sec: config.warmupSec, round: 0 })
    }
    for (let i = 1; i <= config.circuits; i++) {
      q.push({
        kind: 'work',
        label: config.workLabel || 'Jog',
        sec: Math.max(1, config.workSec),
        round: i
      })
      if (config.restSec > 0) {
        q.push({
          kind: 'rest',
          label: config.restLabel || 'Walk',
          sec: config.restSec,
          round: i
        })
      }
    }
    if (config.cooldownSec > 0) {
      q.push({ kind: 'cooldown', label: 'Cool down', sec: config.cooldownSec, round: 0 })
    }
    let start = 0
    for (const phase of q) {
      phase.start = start
      start += phase.sec
    }
    return q
  }

  start(config) {
    this.stop()
    this.config = { ...config }
    this.queue = this.buildQueue(config)
    this.totalSec = this.queue.reduce((sum, p) => sum + p.sec, 0)
    this.startedAt = Date.now()
    this.pausedMs = 0
    this.pauseStarted = 0
    this.currentIndex = -1
    this.lastCountdown = null
    this.state = 'running'
    this.tick()
    this.intervalId = setInterval(() => this.tick(), 200)
  }

  elapsed() {
    if (this.state === 'idle') return 0
    const paused = this.pausedMs + (this.state === 'paused' ? Date.now() - this.pauseStarted : 0)
    return Math.max(0, (Date.now() - this.startedAt - paused) / 1000)
  }

  tick() {
    if (this.state !== 'running') return
    const elapsed = this.elapsed()
    if (elapsed >= this.totalSec) {
      this.finish()
      return
    }

    const idx = this.queue.findIndex((p) => elapsed >= p.start && elapsed < p.start + p.sec)
    if (idx !== this.currentIndex) {
      this.currentIndex = idx < 0 ? this.queue.length - 1 : idx
      this.lastCountdown = null
      this.handlers.onPhase?.(this.queue[this.currentIndex], {
        isFirst: idx === 0 && this._everPhase === false,
        timer: this
      })
      this._everPhase = true
    }

    const phase = this.queue[this.currentIndex]
    const remaining = Math.ceil(phase.start + phase.sec - elapsed)
    if (remaining <= 3 && remaining > 0 && remaining !== this.lastCountdown) {
      this.lastCountdown = remaining
      this.handlers.onCountdown?.(remaining, phase)
    }

    this.handlers.onTick?.(this.snapshot(elapsed))
  }

  snapshot(elapsed = this.elapsed()) {
    const phase = this.queue[this.currentIndex] || this.queue[0] || { label: '', sec: 1, start: 0 }
    return {
      phase,
      remaining: Math.max(0, Math.ceil(phase.start + phase.sec - elapsed)),
      elapsedSec: elapsed,
      totalSec: this.totalSec || 0,
      index: this.currentIndex,
      queueLength: this.queue.length,
      state: this.state,
      phaseProgress: Math.min(1, Math.max(0, (elapsed - phase.start) / phase.sec)),
      sessionProgress: Math.min(1, Math.max(0, elapsed / (this.totalSec || 1))),
      round: phase.round || 0,
      rounds: this.config?.circuits || 0
    }
  }

  pause() {
    if (this.state !== 'running') return
    this.pauseStarted = Date.now()
    this.state = 'paused'
    this.handlers.onTick?.(this.snapshot(this.elapsed()))
  }

  resume() {
    if (this.state !== 'paused') return
    this.pausedMs += Date.now() - this.pauseStarted
    this.pauseStarted = 0
    this.state = 'running'
    this.tick()
  }

  skip() {
    if (this.state !== 'running') return
    const phase = this.queue[this.currentIndex]
    if (!phase) return
    const target = phase.start + phase.sec
    this.startedAt = Date.now() - target * 1000 - this.pausedMs
    this.lastCountdown = null
    this.tick()
  }

  finish() {
    const wasActive = this.state === 'running' || this.state === 'paused'
    this.stop()
    this.state = 'done'
    if (wasActive) this.handlers.onComplete?.(this.config)
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId)
    this.intervalId = null
    this.state = 'idle'
  }
}
