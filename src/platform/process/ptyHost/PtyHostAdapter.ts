import { resolveDefaultShell } from '../pty/defaultShell'
import type { PtyHostSupervisor } from './supervisor'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
  TerminalSessionOpenResult,
} from '../../../contexts/terminal/domain/TerminalSessionAdapter'

interface SessionCallbacks {
  onData: (data: string) => void
  onExit: (exit: { exitCode: number | null }) => void
}

export class PtyHostAdapter implements TerminalSessionAdapter {
  private readonly ptyHost: PtyHostSupervisor
  private readonly sessionCallbacks = new Map<string, SessionCallbacks>()
  private readonly unsubscribeData: () => void
  private readonly unsubscribeExit: () => void

  constructor(ptyHost: PtyHostSupervisor) {
    this.ptyHost = ptyHost

    this.unsubscribeData = ptyHost.onData(({ sessionId, data }) => {
      this.sessionCallbacks.get(sessionId)?.onData(data)
    })

    this.unsubscribeExit = ptyHost.onExit(({ sessionId, exitCode }) => {
      const cbs = this.sessionCallbacks.get(sessionId)
      if (cbs) {
        this.sessionCallbacks.delete(sessionId)
        cbs.onExit({ exitCode })
      }
    })
  }

  async open(options: TerminalSessionOpenOptions): Promise<TerminalSessionOpenResult> {
    const command = options.command ?? options.shell ?? resolveDefaultShell()
    const args = options.command ? (options.args ?? []) : []

    const { sessionId } = await this.ptyHost.spawn({
      cwd: options.cwd ?? process.cwd(),
      command,
      args,
      env: options.env,
      cols: options.cols,
      rows: options.rows,
    })

    let dataCallback: ((data: string) => void) | null = null
    let exitCallback: ((exit: { exitCode: number | null }) => void) | null = null

    this.sessionCallbacks.set(sessionId, {
      onData: data => dataCallback?.(data),
      onExit: exit => exitCallback?.(exit),
    })

    return {
      sessionId,
      stream: {
        onData: cb => {
          dataCallback = cb
        },
        onExit: cb => {
          exitCallback = cb
        },
      },
    }
  }

  write(sessionId: string, data: string, encoding?: 'utf8' | 'binary'): void {
    if (encoding) {
      this.ptyHost.write(sessionId, data, encoding)
    } else {
      this.ptyHost.write(sessionId, data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.ptyHost.resize(sessionId, cols, rows)
  }

  kill(sessionId: string): void {
    this.sessionCallbacks.delete(sessionId)
    this.ptyHost.kill(sessionId)
  }

  disposeAll(): void {
    this.unsubscribeData()
    this.unsubscribeExit()
    this.sessionCallbacks.clear()
    this.ptyHost.dispose()
  }
}
