export type DetectedCanvasInputMode = 'mouse' | 'trackpad'

export interface CanvasInputModalityState {
  mode: DetectedCanvasInputMode
  score: number
  lastEventTimestamp: number | null
  modeLockUntilTimestamp: number | null
}

export interface WheelInputSample {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  timeStamp: number
}

const SCORE_MIN = -16
const SCORE_MAX = 16
const TRACKPAD_SWITCH_THRESHOLD = 5
const MOUSE_SWITCH_THRESHOLD = -5
const STALE_EVENT_GAP_MS = 360
const TRACKPAD_MODE_LOCK_MS = 1800
const MOUSE_MODE_LOCK_MS = 900

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hasFractionalDelta(value: number): boolean {
  if (!Number.isFinite(value)) {
    return false
  }

  return Math.abs(value - Math.trunc(value)) > 0.001
}

function isDiscreteWheelStep(value: number): boolean {
  const absolute = Math.abs(value)
  if (absolute < 24) {
    return false
  }

  const nearestInteger = Math.round(absolute)
  if (Math.abs(absolute - nearestInteger) > 0.001) {
    return false
  }

  return (
    nearestInteger % 40 === 0 ||
    nearestInteger % 50 === 0 ||
    nearestInteger % 60 === 0 ||
    nearestInteger % 100 === 0 ||
    nearestInteger % 120 === 0
  )
}

function normalizeTimestamp(value: number, fallback: number | null): number {
  if (Number.isFinite(value) && value >= 0) {
    return value
  }

  return fallback ?? 0
}

function computeTrackpadEvidence(sample: WheelInputSample, intervalMs: number | null): number {
  if (sample.deltaMode === 1) {
    return -6
  }

  if (sample.deltaMode === 2) {
    return -7
  }

  const absX = Math.abs(sample.deltaX)
  const absY = Math.abs(sample.deltaY)
  const magnitude = Math.hypot(absX, absY)
  const hasBothAxes = absX > 0.01 && absY > 0.01

  let evidence = 0

  if (sample.ctrlKey) {
    evidence += 7
  }

  if (hasBothAxes) {
    evidence += 2
  }

  if (magnitude <= 16) {
    evidence += 1
  }

  if (magnitude >= 96) {
    evidence -= 2
  }

  if (hasFractionalDelta(absX) || hasFractionalDelta(absY)) {
    evidence += 2
  }

  if (absX <= 0.01 && isDiscreteWheelStep(absY)) {
    evidence -= 3
  }

  if (intervalMs !== null && intervalMs >= 0 && intervalMs <= 24) {
    evidence += 1
  }

  return evidence
}

function decayScore(previousScore: number, intervalMs: number | null): number {
  if (intervalMs === null || intervalMs <= STALE_EVENT_GAP_MS) {
    return previousScore
  }

  const decaySteps = Math.min(4, Math.floor(intervalMs / STALE_EVENT_GAP_MS))
  if (decaySteps <= 0) {
    return previousScore
  }

  const ratio = Math.pow(0.6, decaySteps)
  return Math.trunc(previousScore * ratio)
}

export function createCanvasInputModalityState(
  initialMode: DetectedCanvasInputMode = 'mouse',
): CanvasInputModalityState {
  return {
    mode: initialMode,
    score: initialMode === 'trackpad' ? 2 : -2,
    lastEventTimestamp: null,
    modeLockUntilTimestamp: null,
  }
}

export function inferCanvasInputModalityFromWheel(
  previous: CanvasInputModalityState,
  sample: WheelInputSample,
): CanvasInputModalityState {
  const timestamp = normalizeTimestamp(sample.timeStamp, previous.lastEventTimestamp)
  const intervalMs =
    previous.lastEventTimestamp === null || timestamp < previous.lastEventTimestamp
      ? null
      : timestamp - previous.lastEventTimestamp

  const baseScore = decayScore(previous.score, intervalMs)
  const evidence = computeTrackpadEvidence(sample, intervalMs)
  const nextScore = clamp(baseScore + evidence, SCORE_MIN, SCORE_MAX)
  const lockUntil = previous.modeLockUntilTimestamp
  const isModeLocked = lockUntil !== null && timestamp < lockUntil

  let nextMode = previous.mode
  let nextLockUntil = isModeLocked ? lockUntil : null

  if (!isModeLocked) {
    if (nextMode === 'mouse' && nextScore >= TRACKPAD_SWITCH_THRESHOLD) {
      nextMode = 'trackpad'
      nextLockUntil = timestamp + TRACKPAD_MODE_LOCK_MS
    } else if (nextMode === 'trackpad' && nextScore <= MOUSE_SWITCH_THRESHOLD) {
      nextMode = 'mouse'
      nextLockUntil = timestamp + MOUSE_MODE_LOCK_MS
    }
  }

  return {
    mode: nextMode,
    score: nextScore,
    lastEventTimestamp: timestamp,
    modeLockUntilTimestamp: nextLockUntil,
  }
}
