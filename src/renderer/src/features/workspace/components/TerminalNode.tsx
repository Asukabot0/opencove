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

interface SyncSizeOptions {
  sendPtyResize: boolean
  force?: boolean
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
  } | null>(null)
  const isPointerResizingRef = useRef(false)
  const syncFrameRef = useRef<number | null>(null)
  const lastViewportRef = useRef<{
    width: number
    height: number
    cols: number
    rows: number
  }>({
    width: 0,
    height: 0,
    cols: 0,
    rows: 0,
  })
  const draftSizeRef = useRef<{ width: number; height: number } | null>(null)
  const publishTimerRef = useRef<number | null>(null)
  const latestScrollbackRef = useRef(truncateScrollback(scrollback ?? ''))
  const publishedScrollbackRef = useRef(truncateScrollback(scrollback ?? ''))
  const pendingPublishedScrollbackRef = useRef<string | null>(null)
  const onScrollbackChangeRef = useRef<TerminalNodeProps['onScrollbackChange']>(onScrollbackChange)

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
      scheduleScrollbackPublish(immediate)
    },
    [scheduleScrollbackPublish],
  )

  const syncTerminalSize = useCallback(
    ({ sendPtyResize, force = false }: SyncSizeOptions) => {
      const terminal = terminalRef.current
      const fitAddon = fitAddonRef.current
      const container = containerRef.current

      if (!terminal || !fitAddon || !container) {
        return
      }

      const viewportWidth = Math.round(container.clientWidth)
      const viewportHeight = Math.round(container.clientHeight)

      if (viewportWidth <= 2 || viewportHeight <= 2) {
        return
      }

      const lastViewport = lastViewportRef.current
      const viewportChanged =
        viewportWidth !== lastViewport.width || viewportHeight !== lastViewport.height

      if (!force && !viewportChanged && !sendPtyResize) {
        return
      }

      fitAddon.fit()

      if (terminal.cols <= 0 || terminal.rows <= 0) {
        return
      }

      const gridChanged = terminal.cols !== lastViewport.cols || terminal.rows !== lastViewport.rows

      if (force || viewportChanged || gridChanged) {
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
      }

      lastViewportRef.current = {
        width: viewportWidth,
        height: viewportHeight,
        cols: terminal.cols,
        rows: terminal.rows,
      }

      if (!sendPtyResize || (!gridChanged && !force)) {
        return
      }

      void window.coveApi.pty.resize({
        sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
    },
    [sessionId],
  )

  const scheduleSyncTerminalSize = useCallback(
    (options: SyncSizeOptions) => {
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current)
      }

      syncFrameRef.current = requestAnimationFrame(() => {
        syncFrameRef.current = null
        syncTerminalSize(options)
      })
    },
    [syncTerminalSize],
  )

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
    lastViewportRef.current = {
      width: 0,
      height: 0,
      cols: 0,
      rows: 0,
    }

    if (containerRef.current) {
      terminal.open(containerRef.current)
      requestAnimationFrame(() => {
        syncTerminalSize({ sendPtyResize: true, force: true })
      })
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
      syncTerminalSize({ sendPtyResize: true, force: true })
    }

    void hydrateFromSnapshot()

    const resizeObserver = new ResizeObserver(() => {
      scheduleSyncTerminalSize({
        sendPtyResize: !isPointerResizingRef.current,
      })
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleSyncTerminalSize({ sendPtyResize: true, force: true })
      }
    }

    const handleWindowFocus = () => {
      scheduleSyncTerminalSize({ sendPtyResize: true, force: true })
    }

    const handleLayoutSync = () => {
      scheduleSyncTerminalSize({ sendPtyResize: true, force: true })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener(TERMINAL_LAYOUT_SYNC_EVENT, handleLayoutSync)

    return () => {
      isDisposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener(TERMINAL_LAYOUT_SYNC_EVENT, handleLayoutSync)
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current)
        syncFrameRef.current = null
      }
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
  }, [
    scheduleScrollbackPublish,
    scheduleSyncTerminalSize,
    sessionId,
    syncTerminalSize,
    updateScrollback,
  ])

  useEffect(() => {
    scheduleSyncTerminalSize({ sendPtyResize: true })
  }, [height, scheduleSyncTerminalSize, width])

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      resizeStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        width,
        height,
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

      const nextWidth = Math.max(MIN_WIDTH, Math.round(start.width + (event.clientX - start.x)))
      const nextHeight = Math.max(MIN_HEIGHT, Math.round(start.height + (event.clientY - start.y)))

      setDraftSize({ width: nextWidth, height: nextHeight })

      scheduleSyncTerminalSize({
        sendPtyResize: false,
      })
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      isPointerResizingRef.current = false

      const finalSize = draftSizeRef.current ?? { width, height }
      onResize(finalSize)

      resizeStartRef.current = null
      scheduleSyncTerminalSize({ sendPtyResize: true, force: true })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [height, isResizing, onResize, scheduleSyncTerminalSize, width])

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
        className="terminal-node__resizer nodrag"
        onPointerDown={handleResizePointerDown}
        aria-label="Resize terminal"
      />
    </div>
  )
}
