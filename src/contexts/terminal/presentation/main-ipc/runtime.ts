import { webContents } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  AgentLaunchMode,
  AgentProviderId,
  TerminalDataEvent,
  TerminalWriteEncoding,
} from '../../../../shared/contracts/dto'
import type { SpawnPtyOptions } from '../../../../platform/process/pty/PtyManager'
import { LocalPtyAdapter } from '../../../../platform/process/pty/LocalPtyAdapter'
import { TerminalProfileResolver } from '../../../../platform/terminal/TerminalProfileResolver'
import type { GeminiSessionDiscoveryCursor } from '../../../agent/infrastructure/cli/AgentSessionLocatorProviders'
import { createSessionStateWatcherController } from './sessionStateWatcher'
import { TerminalSessionManager } from '../../application/TerminalSessionManager'
import type { TerminalSessionAdapter } from '../../domain/TerminalSessionAdapter'
import type { SessionKind } from '../../domain/types'

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
  listProfiles?: () => Promise<
    import('../../../../shared/contracts/dto').ListTerminalProfilesResult
  >
  spawnTerminalSession?: (
    input: import('../../../../shared/contracts/dto').SpawnTerminalInput,
  ) => Promise<import('../../../../shared/contracts/dto').SpawnTerminalResult>
  spawnSession: (options: SpawnPtyOptions) => { sessionId: string }
  write: (sessionId: string, data: string, encoding?: TerminalWriteEncoding) => void
  resize: (sessionId: string, cols: number, rows: number) => void
  kill: (sessionId: string) => void
  attach: (contentsId: number, sessionId: string) => void
  detach: (contentsId: number, sessionId: string) => void
  snapshot: (sessionId: string) => string
  startSessionStateWatcher: (input: StartSessionStateWatcherInput) => void
  dispose: () => void
}

function reportStateWatcherIssue(message: string): void {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  process.stderr.write(`${message}\n`)
}

export function createPtyRuntime(): PtyRuntime {
  const localAdapter: TerminalSessionAdapter = new LocalPtyAdapter()
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

  const adapterRegistry = new Map<SessionKind, TerminalSessionAdapter>([['local', localAdapter]])

  const manager = new TerminalSessionManager({
    adapterRegistry,
    sendToAllWindows,
    sendPtyDataToSubscriber,
    trackWebContentsDestroyed,
    sessionStateWatcher,
  })

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
    spawnSession: options => {
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

      if (result instanceof Promise) {
        throw new Error('spawnSession does not support async adapters')
      }

      return { sessionId: result.sessionId }
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
      geminiDiscoveryCursor,
    }) => {
      manager.startSessionStateWatcher({
        sessionId,
        provider,
        cwd,
        launchMode,
        resumeSessionId,
        startedAtMs,
        opencodeBaseUrl,
        geminiDiscoveryCursor,
      })
    },
    dispose: () => {
      manager.dispose()
    },
  }
}
