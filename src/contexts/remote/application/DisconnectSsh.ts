export interface SshSessionTerminator {
  killSession(sessionId: string): void
}

export function disconnectSsh(terminator: SshSessionTerminator, sessionId: string): void {
  terminator.killSession(sessionId)
}
