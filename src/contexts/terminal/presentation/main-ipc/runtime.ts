import { app, utilityProcess, webContents } from 'electron'
import type { WebContents } from 'electron'
import process from 'node:process'
import { resolve } from 'node:path'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  AgentLaunchMode,
  AgentProviderId,
  ListTerminalProfilesResult,
  SpawnTerminalInput,
  SpawnTerminalResult,
  TerminalDataEvent,
  TerminalWriteEncoding,
} from '../../../../shared/contracts/dto'
import type { SessionKind } from '../../../../shared/contracts/dto/terminal'
import type { SshConnectionStateEvent } from '../../../../shared/contracts/dto/remote'
import type { SpawnPtyOptions } from '../../../../platform/process/pty/types'
import { PtyHostSupervisor } from '../../../../platform/process/ptyHost/supervisor'
import { PtyHostAdapter } from '../../../../platform/process/ptyHost/PtyHostAdapter'
import type {
  CredentialResolver,
  HostKeyVerifier,
} from '../../../../platform/process/ssh/SshAdapter'
import { TerminalProfileResolver } from '../../../../platform/terminal/TerminalProfileResolver'
import type { GeminiSessionDiscoveryCursor } from '../../../agent/infrastructure/cli/AgentSessionLocatorProviders'
import { createSessionStateWatcherController } from './sessionStateWatcher'
import { TerminalSessionManager } from './sessionManager'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
} from '../../domain/TerminalSessionAdapter'

export interface StartSessionStateWatcherInput {
  sessionId: string
  provider: AgentProviderId
  cwd: string
  launchMode: AgentLaunchMode
  resumeSessionId: string | null
  startedAtMs: number
  opencodeBaseUrl?: string | null
  geminiDiscoveryCursor?: GeminiSessionDiscoveryCursor | null
}

export interface PtyRuntime {
  listProfiles?: () => Promise<ListTerminalProfilesResult>
  spawnTerminalSession?: (input: SpawnTerminalInput) => Promise<SpawnTerminalResult>
  spawnSession: (options: SpawnPtyOptions) => Promise<{ sessionId: string }>
  write: (sessionId: string, data: string, encoding?: TerminalWriteEncoding) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  attach: (contentsId: number, sessionId: string) => void
  detach: (contentsId: number, sessionId: string) => void
  snapshot: (sessionId: string) => string
  startSessionStateWatcher: (input: StartSessionStateWatcherInput) => void
  openSshSession: (options: TerminalSessionOpenOptions) => Promise<{ sessionId: string }>
  emitSshConnectionState: (event: SshConnectionStateEvent) => void
  registerSshCredentialResolver: (targetId: string, webContents: WebContents) => void
  unregisterSshCredentialResolver: (targetId: string) => void
  debugCrashHost?: () => void
  dispose: () => void
}

function reportStateWatcherIssue(message: string): void {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  process.stderr.write(`${message}\n`)
}

export function createPtyRuntime(): PtyRuntime {
  const profileResolver = new TerminalProfileResolver()

  const sendToAllWindows = <Payload>(channel: string, payload: Payload): void => {
    for (const content of webContents.getAllWebContents()) {
      if (content.isDestroyed() || content.getType() !== 'window') {
        continue
      }

      try {
        content.send(channel, payload)
      } catch {
        // Ignore delivery failures (destroyed webContents, navigation in progress, etc.)
      }
    }
  }

  const sessionStateWatcher = createSessionStateWatcherController({
    sendToAllWindows,
    reportIssue: reportStateWatcherIssue,
  })

  const sendPtyDataToSubscriber = (contentsId: number, eventPayload: TerminalDataEvent): void => {
    const content = webContents.fromId(contentsId)
    if (!content || content.isDestroyed() || content.getType() !== 'window') {
      return
    }

    try {
      content.send(IPC_CHANNELS.ptyData, eventPayload)
    } catch {
      // Ignore delivery failures (destroyed webContents, navigation in progress, etc.)
    }
  }

  const trackWebContentsDestroyed = (contentsId: number, onDestroyed: () => void): boolean => {
    const content = webContents.fromId(contentsId)
    if (!content) {
      return false
    }

    content.once('destroyed', onDestroyed)
    return true
  }

  // --- PtyHost + local adapter ---

  const logsDir = resolve(app.getPath('userData'), 'logs')
  const ptyHostLogFilePath = resolve(logsDir, 'pty-host.log')
  const ptyHost = new PtyHostSupervisor({
    baseDir: __dirname,
    logFilePath: ptyHostLogFilePath,
    reportIssue: reportStateWatcherIssue,
    createProcess: modulePath =>
      utilityProcess.fork(modulePath, [], { stdio: 'pipe', serviceName: 'OpenCove PTY Host' }),
  })

  const localAdapter = new PtyHostAdapter(ptyHost)

  // --- SSH credential resolver ---

  const sshCredentialDispatch = new Map<string, WebContents>()

  const sshCredentialResolver: CredentialResolver = async request => {
    const { createWebContentsCredentialResolver } =
      await import('../../../remote/presentation/main-ipc/credentialIpc')
    const wc = sshCredentialDispatch.get(request.targetId)
    if (!wc || wc.isDestroyed()) {
      throw new Error('No WebContents available for credential request')
    }
    return createWebContentsCredentialResolver(wc)(request)
  }

  const sshHostKeyVerifier: HostKeyVerifier = async (host, port, keyType, keyData) => {
    const { verifyHostKey, addTrustedKey } =
      await import('../../../remote/infrastructure/HostKeyVerifier')
    const result = verifyHostKey(host, port, keyType, keyData)
    if (result.status === 'trusted') {
      return true
    }
    if (result.status === 'mismatch') {
      return false
    }
    addTrustedKey(host, port, keyType, keyData)
    return true
  }

  // --- Lazy SSH adapter ---

  let sshAdapterPromise: Promise<TerminalSessionAdapter> | null = null
  const getSshAdapter = (): Promise<TerminalSessionAdapter> => {
    if (!sshAdapterPromise) {
      sshAdapterPromise = import('../../../../platform/process/ssh/SshAdapter').then(
        ({ SshAdapter }) =>
          new SshAdapter({
            credentialResolver: sshCredentialResolver,
            hostKeyVerifier: sshHostKeyVerifier,
          }),
      )
    }
    return sshAdapterPromise
  }

  // --- Session manager ---

  const adapterRegistry = new Map<SessionKind, TerminalSessionAdapter>([['local', localAdapter]])

  const manager = new TerminalSessionManager({
    adapterRegistry,
    sendToAllWindows,
    sendPtyDataToSubscriber,
    trackWebContentsDestroyed,
    sessionStateWatcher,
  })

  // --- PtyRuntime interface ---

  return {
    listProfiles: async () => await profileResolver.listProfiles(),
    spawnTerminalSession: async input => {
      const resolved = await profileResolver.resolveTerminalSpawn(input)
      const result = manager.open('local', {
        sessionKind: 'local',
        cwd: resolved.cwd,
        command: resolved.command,
        args: resolved.args,
        env: resolved.env,
        cols: input.cols,
        rows: input.rows,
      })
      const opened = result instanceof Promise ? await result : result

      return {
        sessionId: opened.sessionId,
        profileId: resolved.profileId,
        runtimeKind: resolved.runtimeKind,
      }
    },
    spawnSession: async options => {
      const result = manager.open('local', {
        sessionKind: 'local',
        cwd: options.cwd,
        command: options.command,
        args: options.args,
        env: options.env,
        shell: options.shell,
        cols: options.cols,
        rows: options.rows,
      })
      const opened = result instanceof Promise ? await result : result
      return { sessionId: opened.sessionId }
    },
    write: (sessionId, data, encoding = 'utf8') => {
      manager.write(sessionId, data, encoding)
    },
    resize: (sessionId, cols, rows) => {
      manager.resize(sessionId, cols, rows)
    },
    kill: sessionId => {
      manager.kill(sessionId)
    },
    attach: (contentsId, sessionId) => {
      manager.attach(contentsId, sessionId)
    },
    detach: (contentsId, sessionId) => {
      manager.detach(contentsId, sessionId)
    },
    snapshot: sessionId => {
      return manager.snapshot(sessionId)
    },
    startSessionStateWatcher: ({
      sessionId,
      provider,
      cwd,
      launchMode,
      resumeSessionId,
      startedAtMs,
      opencodeBaseUrl,
    }: StartSessionStateWatcherInput) => {
      manager.startSessionStateWatcher({
        sessionId,
        provider,
        cwd,
        launchMode,
        resumeSessionId,
        startedAtMs,
        opencodeBaseUrl,
      })
    },
    openSshSession: async options => {
      if (!adapterRegistry.has('ssh')) {
        adapterRegistry.set('ssh', await getSshAdapter())
      }
      const result = manager.open('ssh', options)
      const opened = result instanceof Promise ? await result : result
      return { sessionId: opened.sessionId }
    },
    emitSshConnectionState: event => {
      sendToAllWindows(IPC_CHANNELS.ptySshConnectionState, event)
    },
    registerSshCredentialResolver: (targetId, wc) => {
      sshCredentialDispatch.set(targetId, wc)
    },
    unregisterSshCredentialResolver: targetId => {
      sshCredentialDispatch.delete(targetId)
    },
    ...(process.env.NODE_ENV === 'test'
      ? {
          debugCrashHost: () => {
            ptyHost.crash()
          },
        }
      : {}),
    dispose: () => {
      manager.dispose()
    },
  }
}
