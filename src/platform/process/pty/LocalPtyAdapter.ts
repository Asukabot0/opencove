import { PtyManager } from './PtyManager'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
  TerminalSessionOpenResult,
} from '../../../contexts/terminal/domain/TerminalSessionAdapter'

export class LocalPtyAdapter implements TerminalSessionAdapter {
  private ptyManager = new PtyManager()

  open(options: TerminalSessionOpenOptions): TerminalSessionOpenResult {
    const { sessionId, pty } = this.ptyManager.spawnSession({
      cwd: options.cwd ?? process.cwd(),
      command: options.command,
      args: options.args,
      env: options.env,
      shell: options.shell,
      cols: options.cols,
      rows: options.rows,
    })

    return {
      sessionId,
      stream: {
        onData: cb => {
          pty.onData(cb)
        },
        onExit: cb => {
          pty.onExit(exit => cb({ exitCode: exit.exitCode }))
        },
      },
    }
  }

  write(sessionId: string, data: string, encoding?: 'utf8' | 'binary'): void {
    if (encoding) {
      this.ptyManager.write(sessionId, data, encoding)
    } else {
      this.ptyManager.write(sessionId, data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.ptyManager.resize(sessionId, cols, rows)
  }

  kill(sessionId: string): void {
    this.ptyManager.kill(sessionId)
  }

  snapshot(sessionId: string): string {
    return this.ptyManager.snapshot(sessionId)
  }

  appendSnapshotData(sessionId: string, data: string): void {
    this.ptyManager.appendSnapshotData(sessionId, data)
  }

  delete(sessionId: string, options?: { keepSnapshot?: boolean }): void {
    this.ptyManager.delete(sessionId, options)
  }

  disposeAll(): void {
    this.ptyManager.disposeAll()
  }
}
