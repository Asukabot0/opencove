import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig } from 'ssh2'
import { randomUUID } from 'node:crypto'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
  TerminalSessionOpenResult,
  TerminalSessionAdapterStream,
} from '../../../contexts/terminal/domain/TerminalSessionAdapter'
import type { DisconnectReason } from '../../../contexts/remote/domain/types'

const MAX_SNAPSHOT_CHARS = 400_000
const KEEPALIVE_INTERVAL_MS = 15_000
const KEEPALIVE_COUNT_MAX = 3
const CREDENTIAL_TIMEOUT_MS = 60_000

export interface SshCredentialRequest {
  requestId: string
  targetId: string
  type: 'password' | 'passphrase' | 'keyboard-interactive'
  prompt?: string
  user?: string
  host?: string
}

export interface SshCredentialResponse {
  requestId: string
  value: string
  cancelled?: boolean
}

export type CredentialResolver = (request: SshCredentialRequest) => Promise<SshCredentialResponse>

export type HostKeyVerifier = (
  host: string,
  port: number,
  keyType: string,
  keyData: string,
) => Promise<boolean>

export interface SshAdapterDeps {
  credentialResolver: CredentialResolver
  hostKeyVerifier: HostKeyVerifier
}

interface SshSession {
  client: Client
  stream: ClientChannel | null
  snapshot: string
  dataCallbacks: Array<(data: string) => void>
  exitCallbacks: Array<(exit: { exitCode: number | null }) => void>
}

export class SshAdapter implements TerminalSessionAdapter {
  private sessions = new Map<string, SshSession>()
  private deps: SshAdapterDeps

  constructor(deps: SshAdapterDeps) {
    this.deps = deps
  }

  async open(options: TerminalSessionOpenOptions): Promise<TerminalSessionOpenResult> {
    const sessionId = randomUUID()
    const client = new Client()

    const session: SshSession = {
      client,
      stream: null,
      snapshot: '',
      dataCallbacks: [],
      exitCallbacks: [],
    }
    this.sessions.set(sessionId, session)

    const stream: TerminalSessionAdapterStream = {
      onData: cb => {
        session.dataCallbacks.push(cb)
      },
      onExit: cb => {
        session.exitCallbacks.push(cb)
      },
    }

    const connectConfig = await this.buildConnectConfig(options)

    // Verify host key during the SSH handshake (before authentication).
    // ssh2 supports an async callback form: (key, verify) => void
    connectConfig.hostVerifier = (key: Buffer, verify: (valid: boolean) => void) => {
      try {
        const keyTypeLen = key.readUInt32BE(0)
        const keyType = key.subarray(4, 4 + keyTypeLen).toString('ascii')
        const keyData = key.toString('base64')
        this.deps
          .hostKeyVerifier(options.sshHost!, options.sshPort ?? 22, keyType, keyData)
          .then(valid => verify(valid))
          .catch(() => verify(false))
      } catch {
        verify(false)
      }
    }

    return new Promise<TerminalSessionOpenResult>((resolve, reject) => {
      client.on('ready', () => {
        client.shell(
          { term: 'xterm-256color', cols: options.cols, rows: options.rows },
          (err, shellStream) => {
            if (err) {
              this.cleanupSession(sessionId)
              reject(err)
              return
            }

            session.stream = shellStream

            shellStream.on('data', (data: Buffer) => {
              const str = data.toString('utf8')
              for (const cb of session.dataCallbacks) {
                cb(str)
              }
            })

            shellStream.on('close', () => {
              for (const cb of session.exitCallbacks) {
                cb({ exitCode: null })
              }
              this.cleanupSession(sessionId)
            })

            resolve({ sessionId, stream })
          },
        )
      })

      client.on('error', err => {
        const reason = this.classifyError(err)
        this.emitExit(sessionId, reason)
        this.cleanupSession(sessionId)
        if (!session.stream) {
          reject(err)
        }
      })

      client.on('end', () => {
        this.emitExit(sessionId, 'normal')
        this.cleanupSession(sessionId)
      })

      client.connect(connectConfig)
    })
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session?.stream) {
      return
    }
    session.stream.write(Buffer.from(data, 'utf8'))
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session?.stream) {
      return
    }
    session.stream.setWindow(rows, cols, rows * 16, cols * 8)
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    if (session.stream) {
      session.stream.close()
    }
    session.client.end()
  }

  snapshot(sessionId: string): string {
    return this.sessions.get(sessionId)?.snapshot ?? ''
  }

  appendSnapshotData(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    session.snapshot += data
    if (session.snapshot.length > MAX_SNAPSHOT_CHARS) {
      session.snapshot = session.snapshot.slice(-MAX_SNAPSHOT_CHARS)
    }
  }

  delete(sessionId: string, _options?: { keepSnapshot?: boolean }): void {
    this.kill(sessionId)
    this.sessions.delete(sessionId)
  }

  disposeAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.kill(sessionId)
    }
    this.sessions.clear()
  }

  private async buildConnectConfig(options: TerminalSessionOpenOptions): Promise<ConnectConfig> {
    const config: ConnectConfig = {
      host: options.sshHost,
      port: options.sshPort ?? 22,
      username: options.sshUsername,
      readyTimeout: options.connectTimeout ?? 10_000,
      keepaliveInterval: KEEPALIVE_INTERVAL_MS,
      keepaliveCountMax: KEEPALIVE_COUNT_MAX,
    }

    if (options.sshForwardAgent) {
      config.agentForward = true
    }

    if (options.sshAuthMethod === 'agent') {
      config.agent = process.env.SSH_AUTH_SOCK
    } else if (options.sshAuthMethod === 'key' && options.sshKeyPath) {
      const { readFileSync } = await import('node:fs')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')
      const resolvedKeyPath = options.sshKeyPath.startsWith('~/')
        ? join(homedir(), options.sshKeyPath.slice(2))
        : options.sshKeyPath
      const keyData = readFileSync(resolvedKeyPath, 'utf8')
      config.privateKey = keyData

      if (this.keyNeedsPassphrase(keyData)) {
        const response = await this.resolveCredential(
          options.targetId ?? '',
          'passphrase',
          'Enter passphrase for SSH key',
          options.sshUsername,
          options.sshHost,
        )
        config.passphrase = response
      }
    } else if (options.sshAuthMethod === 'password') {
      const response = await this.resolveCredential(
        options.targetId ?? '',
        'password',
        'Enter SSH password',
        options.sshUsername,
        options.sshHost,
      )
      config.password = response
    }

    return config
  }

  private async resolveCredential(
    targetId: string,
    type: 'password' | 'passphrase' | 'keyboard-interactive',
    prompt: string,
    user?: string,
    host?: string,
  ): Promise<string> {
    const requestId = randomUUID()
    let timeoutId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Credential request timed out')),
        CREDENTIAL_TIMEOUT_MS,
      )
    })

    const credentialPromise = this.deps.credentialResolver({
      requestId,
      targetId,
      type,
      prompt,
      user,
      host,
    })

    try {
      const response = await Promise.race([credentialPromise, timeoutPromise])
      clearTimeout(timeoutId!)
      if (response.cancelled) {
        throw new Error('Credential request cancelled by user')
      }
      return response.value
    } catch (err) {
      clearTimeout(timeoutId!)
      throw err
    }
  }

  private keyNeedsPassphrase(keyData: string): boolean {
    return keyData.includes('ENCRYPTED') || keyData.includes('Proc-Type: 4,ENCRYPTED')
  }

  private classifyError(err: Error & { level?: string }): DisconnectReason {
    const msg = err.message.toLowerCase()
    if (msg.includes('authentication') || msg.includes('auth')) {
      return 'auth_failed'
    }
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('ehostunreach')) {
      return 'network_unreachable'
    }
    if (msg.includes('host key')) {
      return 'host_key_mismatch'
    }
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return 'timeout'
    }
    if (msg.includes('cancelled') || msg.includes('canceled')) {
      return 'user_cancelled'
    }
    return 'unknown'
  }

  private emitExit(sessionId: string, _reason: DisconnectReason): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    for (const cb of session.exitCallbacks) {
      cb({ exitCode: null })
    }
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    try {
      session.client.end()
    } catch {
      // ignore
    }
    this.sessions.delete(sessionId)
  }
}
