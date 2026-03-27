import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig } from 'ssh2'
import { randomUUID } from 'node:crypto'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
  TerminalSessionOpenResult,
  TerminalSessionAdapterStream,
} from '../../../contexts/terminal/domain/TerminalSessionAdapter'

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
  exited: boolean
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
      exited: false,
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
              if (session.exited) {
                return
              }
              session.exited = true
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
        this.emitExit(sessionId)
        this.cleanupSession(sessionId)
        if (!session.stream) {
          reject(err)
        }
      })

      client.on('end', () => {
        this.emitExit(sessionId)
        this.cleanupSession(sessionId)
      })

      client.connect(connectConfig)
    })
  }

  write(sessionId: string, data: string, encoding?: 'utf8' | 'binary'): void {
    const session = this.sessions.get(sessionId)
    if (!session?.stream) {
      return
    }
    session.stream.write(Buffer.from(data, encoding ?? 'utf8'))
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
    this.sessions.delete(sessionId)
  }

  disposeAll(): void {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.stream) {
        session.stream.close()
      }
      session.client.end()
      this.sessions.delete(sessionId)
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

  private emitExit(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.exited) {
      return
    }
    session.exited = true
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
