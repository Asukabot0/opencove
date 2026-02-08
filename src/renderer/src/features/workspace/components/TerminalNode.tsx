import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalNodeProps {
  sessionId: string
  title: string
  width: number
  height: number
  onClose: () => void
  onResize: (size: { width: number; height: number }) => void
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 220

export function TerminalNode({
  sessionId,
  title,
  width,
  height,
  onClose,
  onResize,
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

  const [isResizing, setIsResizing] = useState(false)
  const sizeStyle = useMemo(() => ({ width, height }), [width, height])

  const syncTerminalSize = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) {
      return
    }

    fitAddon.fit()
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

    const unsubscribeData = window.coveApi.pty.onData(event => {
      if (event.sessionId !== sessionId) {
        return
      }

      terminal.write(event.data)
    })

    const unsubscribeExit = window.coveApi.pty.onExit(event => {
      if (event.sessionId !== sessionId) {
        return
      }

      terminal.writeln(`\r\n[process exited with code ${event.exitCode}]`)
    })

    return () => {
      disposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      terminal.dispose()
    }
  }, [sessionId, syncTerminalSize])

  useEffect(() => {
    const frame = requestAnimationFrame(syncTerminalSize)
    return () => cancelAnimationFrame(frame)
  }, [height, syncTerminalSize, width])

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

      onResize({ width: nextWidth, height: nextHeight })
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      resizeStartRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onResize])

  return (
    <div
      className="terminal-node nowheel"
      style={sizeStyle}
      onWheelCapture={event => {
        event.stopPropagation()
      }}
    >
      <div className="terminal-node__header" data-node-drag-handle="true">
        <span className="terminal-node__title">{title}</span>
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
