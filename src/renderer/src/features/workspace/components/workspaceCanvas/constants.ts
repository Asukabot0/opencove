import type { Size, TaskPriority } from '../../types'
import {
  DEFAULT_AGENT_SETTINGS,
  MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT,
  MIN_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT,
} from '../../../settings/agentConfig'

export const DEFAULT_TERMINAL_WINDOW_BASE_SIZE: Size = {
  width: 780,
  height: 600,
}

export const MIN_SIZE: Size = {
  width: 320,
  height: 220,
}

const DEFAULT_VIEWPORT_SIZE: Size = {
  width: 1440,
  height: 900,
}

export const DEFAULT_TASK_WINDOW_WIDTH_RATIO = 0.3
export const DEFAULT_TASK_WINDOW_HEIGHT_RATIO = 0.8

export const DEFAULT_TASK_WINDOW_MAX_SIZE: Size = {
  width: 640,
  height: 920,
}

export const DEFAULT_NOTE_WINDOW_SIZE: Size = {
  width: 420,
  height: 280,
}

export const DEFAULT_TERMINAL_WINDOW_MAX_SIZE: Size = {
  width: Math.round(
    (DEFAULT_TERMINAL_WINDOW_BASE_SIZE.width * MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT) / 100,
  ),
  height: Math.round(
    (DEFAULT_TERMINAL_WINDOW_BASE_SIZE.height * MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT) / 100,
  ),
}

export const MIN_CANVAS_ZOOM = 0.1
export const MAX_CANVAS_ZOOM = 2
export const TRACKPAD_PAN_SCROLL_SPEED = 0.5
export const TRACKPAD_PINCH_SENSITIVITY = 0.01
export const TRACKPAD_GESTURE_LOCK_GAP_MS = 220

function resolvePositiveDimension(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  return Math.round(fallback)
}

function resolveViewportSize(viewport?: Partial<Size>): Size {
  const fallbackWidth =
    typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0
      ? window.innerWidth
      : DEFAULT_VIEWPORT_SIZE.width
  const fallbackHeight =
    typeof window !== 'undefined' && Number.isFinite(window.innerHeight) && window.innerHeight > 0
      ? window.innerHeight
      : DEFAULT_VIEWPORT_SIZE.height

  return {
    width: resolvePositiveDimension(viewport?.width, fallbackWidth),
    height: resolvePositiveDimension(viewport?.height, fallbackHeight),
  }
}

export function resolveDefaultTaskWindowSize(viewport?: Partial<Size>): Size {
  const nextViewport = resolveViewportSize(viewport)
  const widthByRatio = Math.round(nextViewport.width * DEFAULT_TASK_WINDOW_WIDTH_RATIO)
  const heightByRatio = Math.round(nextViewport.height * DEFAULT_TASK_WINDOW_HEIGHT_RATIO)

  return {
    width: Math.max(MIN_SIZE.width, Math.min(DEFAULT_TASK_WINDOW_MAX_SIZE.width, widthByRatio)),
    height: Math.max(MIN_SIZE.height, Math.min(DEFAULT_TASK_WINDOW_MAX_SIZE.height, heightByRatio)),
  }
}

export function resolveDefaultTerminalWindowSize(scalePercent: number): Size {
  const normalizedScale = Number.isFinite(scalePercent)
    ? Math.round(scalePercent)
    : DEFAULT_AGENT_SETTINGS.defaultTerminalWindowScalePercent
  const clampedScale = Math.max(
    MIN_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT,
    Math.min(MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT, normalizedScale),
  )

  return {
    width: Math.max(
      MIN_SIZE.width,
      Math.min(
        DEFAULT_TERMINAL_WINDOW_MAX_SIZE.width,
        Math.round((DEFAULT_TERMINAL_WINDOW_BASE_SIZE.width * clampedScale) / 100),
      ),
    ),
    height: Math.max(
      MIN_SIZE.height,
      Math.min(
        DEFAULT_TERMINAL_WINDOW_MAX_SIZE.height,
        Math.round((DEFAULT_TERMINAL_WINDOW_BASE_SIZE.height * clampedScale) / 100),
      ),
    ),
  }
}

export function resolveDefaultAgentWindowSize(
  scalePercent: number,
  viewport?: Partial<Size>,
): Size {
  const terminalSize = resolveDefaultTerminalWindowSize(scalePercent)
  const taskSize = resolveDefaultTaskWindowSize(viewport)

  return {
    width: terminalSize.width,
    height: taskSize.height,
  }
}

export const TASK_PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const TASK_PRIORITIES: TaskPriority[] = TASK_PRIORITY_OPTIONS.map(option => option.value)
