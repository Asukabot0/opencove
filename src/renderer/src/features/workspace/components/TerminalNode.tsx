import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { AgentRuntimeStatus, WorkspaceNodeKind } from '../types'

interface TerminalNodeProps {
  sessionId: string
  title: string
  kind: WorkspaceNodeKind
  status: AgentRuntimeStatus | null
  lastError: string | null
  width: number
  height: number
  scrollback: string | null
  onClose: () => void
  onResize: (size: { width: number; height: number }) => void
  onScrollbackChange?: (scrollback: string) => void
  onStop?: () => void
  onRerun?: () => void
  onResume?: () => void
}

type ResizeAxis = 'horizontal' | 'vertical'

const MIN_WIDTH = 320
const MIN_HEIGHT = 220
const MAX_SCROLLBACK_CHARS = 200_000
const SCROLLBACK_PUBLISH_DELAY_MS = 800
const MAX_OVERLAP_PROBE_CHARS = 4096
const TERMINAL_LAYOUT_SYNC_EVENT = 'cove:terminal-layout-sync'

function truncateScrollback(snapshot: string): string {
  if (snapshot.length <= MAX_SCROLLBACK_CHARS) {
    return snapshot
  }

  return snapshot.slice(-MAX_SCROLLBACK_CHARS)
}

function appendScrollback(previous: string, chunk: string): string {
  if (chunk.length === 0) {
    return previous
  }

  return truncateScrollback(`${previous}${chunk}`)
}

function calculateSuffixPrefixOverlap(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length, MAX_OVERLAP_PROBE_CHARS)

  for (let size = maxLength; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size
    }
  }

  return 0
}

function mergeScrollbackSnapshots(persisted: string, live: string): string {
  const persistedSnapshot = truncateScrollback(persisted)
  const liveSnapshot = truncateScrollback(live)

  if (persistedSnapshot.length === 0) {
    return liveSnapshot
  }

  if (liveSnapshot.length === 0) {
    return persistedSnapshot
  }

  if (persistedSnapshot === liveSnapshot) {
    return liveSnapshot
  }

  if (liveSnapshot.includes(persistedSnapshot)) {
    return liveSnapshot
  }

  if (persistedSnapshot.includes(liveSnapshot)) {
    return persistedSnapshot
  }

  const overlap = calculateSuffixPrefixOverlap(persistedSnapshot, liveSnapshot)
  return truncateScrollback(`${persistedSnapshot}${liveSnapshot.slice(overlap)}`)
}

function getStatusLabel(status: AgentRuntimeStatus | null): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'exited':
      return 'Exited'
    case 'failed':
      return 'Failed'
    case 'stopped':
      return 'Stopped'
    case 'restoring':
      return 'Restoring'
    default:
      return 'Running'
  }
}

function getStatusClassName(status: AgentRuntimeStatus | null): string {
  switch (status) {
    case 'exited':
      return 'terminal-node__status--exited'
    case 'failed':
      return 'terminal-node__status--failed'
    case 'stopped':
      return 'terminal-node__status--stopped'
    case 'restoring':
      return 'terminal-node__status--restoring'
    case 'running':
    default:
      return 'terminal-node__status--running'
  }
}

export function TerminalNode({
  sessionId,
  title,
  kind,
  status,
  lastError,
  width,
  height,
  scrollback,
  onClose,
  onResize,
  onScrollbackChange,
  onStop,
  onRerun,
  onResume,
}: TerminalNodeProps): JSX.Element {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const resizeStartRef = useRef<{
    x: number
    y: number
    width: number
    height: number
    axis: ResizeAxis
  } | null>(null)
  const isPointerResizingRef = useRef(false)

  const publishTimerRef = useRef<number | null>(null)
  const latestScrollbackRef = useRef(truncateScrollback(scrollback ?? ''))
  const publishedScrollbackRef = useRef(truncateScrollback(scrollback ?? ''))
  const pendingPublishedScrollbackRef = useRef<string | null>(null)
  const onScrollbackChangeRef = useRef<TerminalNodeProps['onScrollbackChange']>(onScrollbackChange)

  const draftSizeRef = useRef<{ width: number; height: number } | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [draftSize, setDraftSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    draftSizeRef.current = draftSize
  }, [draftSize])

  useEffect(() => {
    if (!draftSize || isResizing) {
      return
    }

    if (draftSize.width === width && draftSize.height === height) {
      setDraftSize(null)
    }
  }, [draftSize, height, isResizing, width])

  useEffect(() => {
    const normalized = truncateScrollback(scrollback ?? '')
    latestScrollbackRef.current = normalized
    publishedScrollbackRef.current = normalized
    pendingPublishedScrollbackRef.current = null

    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current)
      publishTimerRef.current = null
    }
  }, [scrollback, sessionId])

  useEffect(() => {
    onScrollbackChangeRef.current = onScrollbackChange
  }, [onScrollbackChange])

  const renderedSize = draftSize ?? { width, height }
  const sizeStyle = useMemo(
    () => ({ width: renderedSize.width, height: renderedSize.height }),
    [renderedSize.height, renderedSize.width],
  )

  const flushScrollback = useCallback(() => {
    const onScrollbackChangeFn = onScrollbackChangeRef.current
    if (!onScrollbackChangeFn) {
      pendingPublishedScrollbackRef.current = null
      return
    }

    const pending = pendingPublishedScrollbackRef.current
    if (pending === null || pending === publishedScrollbackRef.current) {
      return
    }

    pendingPublishedScrollbackRef.current = null
    publishedScrollbackRef.current = pending
    onScrollbackChangeFn(pending)
  }, [])

  const scheduleScrollbackPublish = useCallback(
    (immediate = false) => {
      if (immediate) {
        if (publishTimerRef.current !== null) {
          window.clearTimeout(publishTimerRef.current)
          publishTimerRef.current = null
        }

        flushScrollback()
        return
      }

      if (publishTimerRef.current !== null) {
        return
      }

      publishTimerRef.current = window.setTimeout(() => {
        publishTimerRef.current = null
        flushScrollback()
      }, SCROLLBACK_PUBLISH_DELAY_MS)
    },
    [flushScrollback],
  )

  const updateScrollback = useCallback(
    (nextSnapshot: string, immediate = false) => {
      const normalized = truncateScrollback(nextSnapshot)
      latestScrollbackRef.current = normalized
      pendingPublishedScrollbackRef.current = normalized

      if (isPointerResizingRef.current) {
        return
      }

      scheduleScrollbackPublish(immediate)
    },
    [scheduleScrollbackPublish],
  )

  const syncTerminalSize = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const container = containerRef.current

    if (!terminal || !fitAddon || !container) {
      return
    }

    if (container.clientWidth <= 2 || container.clientHeight <= 2) {
      return
    }

    fitAddon.fit()

    if (terminal.cols <= 0 || terminal.rows <= 0) {
      return
    }

    terminal.refresh(0, Math.max(0, terminal.rows - 1))

    void window.coveApi.pty.resize({
      sessionId,
      cols: terminal.cols,
      rows: terminal.rows,
    })
  }, [sessionId])

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily:
        'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      theme: {
        background: '#0a0f1d',
        foreground: '#d6e4ff',
      },
      allowProposedApi: true,
      convertEol: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    if (containerRef.current) {
      terminal.open(containerRef.current)
      requestAnimationFrame(syncTerminalSize)
    }

    const disposable = terminal.onData(data => {
      void window.coveApi.pty.write({ sessionId, data })
    })

    let unsubscribeData: (() => void) | null = null
    let unsubscribeExit: (() => void) | null = null
    let isDisposed = false

    const bindSessionEvents = () => {
      unsubscribeData = window.coveApi.pty.onData(event => {
        if (event.sessionId !== sessionId) {
          return
        }

        terminal.write(event.data)

        const nextSnapshot = appendScrollback(latestScrollbackRef.current, event.data)
        updateScrollback(nextSnapshot)
      })

      unsubscribeExit = window.coveApi.pty.onExit(event => {
        if (event.sessionId !== sessionId) {
          return
        }

        const exitMessage = `\r\n[process exited with code ${event.exitCode}]\r\n`
        terminal.write(exitMessage)

        const nextSnapshot = appendScrollback(latestScrollbackRef.current, exitMessage)
        updateScrollback(nextSnapshot, true)
      })
    }

    const hydrateFromSnapshot = async () => {
      let mergedSnapshot = latestScrollbackRef.current

      try {
        const snapshot = await window.coveApi.pty.snapshot({ sessionId })
        mergedSnapshot = mergeScrollbackSnapshots(latestScrollbackRef.current, snapshot.data)
      } catch {
        // ignore snapshot read failures and continue with available persisted history
      }

      if (isDisposed) {
        return
      }

      if (mergedSnapshot.length > 0) {
        terminal.write(mergedSnapshot)
      }

      updateScrollback(mergedSnapshot, true)
      bindSessionEvents()
      syncTerminalSize()
    }

    void hydrateFromSnapshot()

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncTerminalSize()
      }
    }

    const handleWindowFocus = () => {
      syncTerminalSize()
    }

    const handleLayoutSync = () => {
      syncTerminalSize()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener(TERMINAL_LAYOUT_SYNC_EVENT, handleLayoutSync)

    return () => {
      isDisposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener(TERMINAL_LAYOUT_SYNC_EVENT, handleLayoutSync)
      resizeObserver.disconnect()
      disposable.dispose()
      unsubscribeData?.()
      unsubscribeExit?.()
      scheduleScrollbackPublish(true)
      if (publishTimerRef.current !== null) {
        window.clearTimeout(publishTimerRef.current)
        publishTimerRef.current = null
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [scheduleScrollbackPublish, sessionId, syncTerminalSize, updateScrollback])

  useEffect(() => {
    const frame = requestAnimationFrame(syncTerminalSize)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [height, syncTerminalSize, width])

  const handleResizePointerDown = useCallback(
    (axis: ResizeAxis) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      resizeStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        width,
        height,
        axis,
      }

      isPointerResizingRef.current = true
      setDraftSize({ width, height })
      setIsResizing(true)
    },
    [height, width],
  )

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current
      if (!start) {
        return
      }

      if (start.axis === 'horizontal') {
        const nextWidth = Math.max(MIN_WIDTH, Math.round(start.width + (event.clientX - start.x)))
        setDraftSize({ width: nextWidth, height: start.height })
        return
      }

      const nextHeight = Math.max(MIN_HEIGHT, Math.round(start.height + (event.clientY - start.y)))
      setDraftSize({ width: start.width, height: nextHeight })
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      isPointerResizingRef.current = false

      const finalSize = draftSizeRef.current ?? { width, height }
      onResize(finalSize)

      resizeStartRef.current = null
      requestAnimationFrame(() => {
        syncTerminalSize()
        scheduleScrollbackPublish(true)
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [height, isResizing, onResize, scheduleScrollbackPublish, syncTerminalSize, width])

  const isAgentNode = kind === 'agent'
  const canStop =
    isAgentNode &&
    (status === 'running' || status === 'restoring' || status === null) &&
    typeof onStop === 'function'

  return (
    <div
      className="terminal-node nowheel"
      style={sizeStyle}
      onWheel={event => {
        event.stopPropagation()
      }}
    >
      <div className="terminal-node__header" data-node-drag-handle="true">
        <span className="terminal-node__title">{title}</span>

        {isAgentNode ? (
          <div className="terminal-node__agent-controls nodrag">
            <span className={`terminal-node__status ${getStatusClassName(status)}`}>
              {getStatusLabel(status)}
            </span>
            <button
              type="button"
              className="terminal-node__action"
              disabled={!canStop}
              onClick={event => {
                event.stopPropagation()
                onStop?.()
              }}
            >
              Stop
            </button>
            <button
              type="button"
              className="terminal-node__action"
              disabled={typeof onRerun !== 'function'}
              onClick={event => {
                event.stopPropagation()
                onRerun?.()
              }}
            >
              Rerun
            </button>
            <button
              type="button"
              className="terminal-node__action"
              disabled={typeof onResume !== 'function'}
              onClick={event => {
                event.stopPropagation()
                onResume?.()
              }}
            >
              Resume
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="terminal-node__close nodrag"
          onClick={event => {
            event.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      </div>

      {isAgentNode && lastError ? <div className="terminal-node__error">{lastError}</div> : null}

      <div ref={containerRef} className="terminal-node__terminal nodrag" />
      <button
        type="button"
        className="terminal-node__resizer terminal-node__resizer--right nodrag"
        onPointerDown={handleResizePointerDown('horizontal')}
        aria-label="Resize terminal width"
        data-testid="terminal-resizer-right"
      />
      <button
        type="button"
        className="terminal-node__resizer terminal-node__resizer--bottom nodrag"
        onPointerDown={handleResizePointerDown('vertical')}
        aria-label="Resize terminal height"
        data-testid="terminal-resizer-bottom"
      />
    </div>
  )
}
