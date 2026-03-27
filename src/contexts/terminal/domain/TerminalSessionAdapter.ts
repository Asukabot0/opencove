import type { SessionKind } from './types'

export interface TerminalSessionAdapterStream {
  onData: (callback: (data: string) => void) => void
  onExit: (callback: (exit: { exitCode: number | null }) => void) => void
}

export interface TerminalSessionOpenOptions {
  sessionKind: SessionKind
  cols: number
  rows: number
  // local-specific
  cwd?: string
  command?: string
  args?: string[]
  env?: NodeJS.ProcessEnv
  shell?: string
  // ssh-specific
  targetId?: string
  sshHost?: string
  sshPort?: number
  sshUsername?: string
  sshAuthMethod?: string
  sshKeyPath?: string
  sshForwardAgent?: boolean
  connectTimeout?: number
}

export interface TerminalSessionOpenResult {
  sessionId: string
  stream: TerminalSessionAdapterStream
}

export interface TerminalSessionAdapter {
  open(
    options: TerminalSessionOpenOptions,
  ): TerminalSessionOpenResult | Promise<TerminalSessionOpenResult>
  write(sessionId: string, data: string, encoding?: 'utf8' | 'binary'): void
  resize(sessionId: string, cols: number, rows: number): void
  kill(sessionId: string): void
  snapshot(sessionId: string): string
  appendSnapshotData(sessionId: string, data: string): void
  delete(sessionId: string, options?: { keepSnapshot?: boolean }): void
  disposeAll(): void
}
