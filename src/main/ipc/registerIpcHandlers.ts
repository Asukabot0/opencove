import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { dialog, ipcMain, webContents } from 'electron'
import type { IPty } from 'node-pty'
import { IPC_CHANNELS } from '../../shared/constants/ipc'
import type {
  AgentProviderId,
  EnsureDirectoryInput,
  KillTerminalInput,
  LaunchAgentInput,
  LaunchAgentResult,
  ListAgentModelsInput,
  ResizeTerminalInput,
  SnapshotTerminalInput,
  SnapshotTerminalResult,
  SpawnTerminalInput,
  SuggestTaskTitleInput,
  SuggestTaskTitleResult,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceDirectory,
  WriteTerminalInput,
} from '../../shared/types/api'
import { buildAgentLaunchCommand } from '../infrastructure/agent/AgentCommandFactory'
import { listAgentModels } from '../infrastructure/agent/AgentModelService'
import { locateAgentResumeSessionId } from '../infrastructure/agent/AgentSessionLocator'
import { PtyManager } from '../infrastructure/pty/PtyManager'
import { suggestTaskTitle } from '../infrastructure/task/TaskTitleGenerator'

export interface IpcRegistrationDisposable {
  dispose: () => void
}

function normalizeProvider(value: unknown): AgentProviderId {
  if (value !== 'claude-code' && value !== 'codex') {
    throw new Error('Invalid provider')
  }

  return value
}

function normalizeListModelsPayload(payload: unknown): ListAgentModelsInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid provider for agent:list-models')
  }

  const record = payload as Record<string, unknown>

  return {
    provider: normalizeProvider(record.provider),
  }
}

function resolveAgentTestStub(
  provider: AgentProviderId,
  model: string | null,
  mode: LaunchAgentInput['mode'],
): {
  command: string
  args: string[]
} | null {
  if (process.env.NODE_ENV !== 'test') {
    return null
  }

  if (process.platform === 'win32') {
    const message = `[cove-test-agent] ${provider} ${mode ?? 'new'} ${model ?? 'default-model'}`
    return {
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `Write-Output "${message}"; Start-Sleep -Seconds 120`,
      ],
    }
  }

  const shell = process.env.SHELL ?? '/bin/zsh'
  const message = `[cove-test-agent] ${provider} ${mode ?? 'new'} ${model ?? 'default-model'}`

  return {
    command: shell,
    args: ['-lc', `printf '%s\n' "${message}"; sleep 120`],
  }
}

function normalizeLaunchAgentPayload(payload: unknown): LaunchAgentInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for agent:launch')
  }

  const record = payload as Record<string, unknown>
  const provider = normalizeProvider(record.provider)
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  const mode = record.mode === 'resume' ? 'resume' : 'new'

  const model = typeof record.model === 'string' ? record.model.trim() : ''
  const resumeSessionId =
    typeof record.resumeSessionId === 'string' ? record.resumeSessionId.trim() : ''

  const cols =
    typeof record.cols === 'number' && Number.isFinite(record.cols) && record.cols > 0
      ? Math.floor(record.cols)
      : 80
  const rows =
    typeof record.rows === 'number' && Number.isFinite(record.rows) && record.rows > 0
      ? Math.floor(record.rows)
      : 24

  if (cwd.length === 0) {
    throw new Error('Invalid cwd for agent:launch')
  }

  if (mode === 'new' && prompt.length === 0) {
    throw new Error('Invalid prompt for agent:launch')
  }

  return {
    provider,
    cwd,
    prompt,
    mode,
    model: model.length > 0 ? model : null,
    resumeSessionId: resumeSessionId.length > 0 ? resumeSessionId : null,
    cols,
    rows,
  }
}

function normalizeEnsureDirectoryPayload(payload: unknown): EnsureDirectoryInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for workspace:ensure-directory')
  }

  const record = payload as Record<string, unknown>
  const path = typeof record.path === 'string' ? record.path.trim() : ''

  if (path.length === 0) {
    throw new Error('Invalid path for workspace:ensure-directory')
  }

  return { path }
}

function normalizeSnapshotPayload(payload: unknown): SnapshotTerminalInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for pty:snapshot')
  }

  const record = payload as Record<string, unknown>
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''

  if (sessionId.length === 0) {
    throw new Error('Invalid sessionId for pty:snapshot')
  }

  return { sessionId }
}

function normalizeSuggestTaskTitlePayload(payload: unknown): SuggestTaskTitleInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for task:suggest-title')
  }

  const record = payload as Record<string, unknown>

  const provider = normalizeProvider(record.provider)
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const requirement = typeof record.requirement === 'string' ? record.requirement.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''

  if (cwd.length === 0) {
    throw new Error('Invalid cwd for task:suggest-title')
  }

  if (requirement.length === 0) {
    throw new Error('Invalid requirement for task:suggest-title')
  }

  return {
    provider,
    cwd,
    requirement,
    model: model.length > 0 ? model : null,
  }
}

export function registerIpcHandlers(): IpcRegistrationDisposable {
  const ptyManager = new PtyManager()
  const terminalProbeBufferBySession = new Map<string, string>()

  const resolveTerminalProbeReplies = (sessionId: string, outputChunk: string): void => {
    if (outputChunk.includes('\u001b[6n')) {
      ptyManager.write(sessionId, '\u001b[1;1R')
    }

    if (outputChunk.includes('\u001b[?6n')) {
      ptyManager.write(sessionId, '\u001b[?1;1R')
    }

    if (outputChunk.includes('\u001b[c')) {
      ptyManager.write(sessionId, '\u001b[?1;2c')
    }

    if (outputChunk.includes('\u001b[>c')) {
      ptyManager.write(sessionId, '\u001b[>0;115;0c')
    }

    if (outputChunk.includes('\u001b[?u')) {
      ptyManager.write(sessionId, '\u001b[?0u')
    }
  }

  const wirePtySessionEvents = (sessionId: string, pty: IPty): void => {
    pty.onData(data => {
      const probeBuffer = `${terminalProbeBufferBySession.get(sessionId) ?? ''}${data}`
      resolveTerminalProbeReplies(sessionId, probeBuffer)
      terminalProbeBufferBySession.set(sessionId, probeBuffer.slice(-32))

      ptyManager.appendSnapshotData(sessionId, data)

      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalDataEvent = { sessionId, data }
        content.send(IPC_CHANNELS.ptyData, eventPayload)
      })
    })

    pty.onExit(exit => {
      terminalProbeBufferBySession.delete(sessionId)
      ptyManager.delete(sessionId)
      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalExitEvent = {
          sessionId,
          exitCode: exit.exitCode,
        }
        content.send(IPC_CHANNELS.ptyExit, eventPayload)
      })
    })
  }

  ipcMain.handle(
    IPC_CHANNELS.workspaceSelectDirectory,
    async (): Promise<WorkspaceDirectory | null> => {
      if (process.env.COVE_TEST_WORKSPACE) {
        const testWorkspacePath = resolve(process.env.COVE_TEST_WORKSPACE)
        return {
          id: crypto.randomUUID(),
          name: basename(testWorkspacePath),
          path: testWorkspacePath,
        }
      }

      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const workspacePath = result.filePaths[0]
      const pathChunks = workspacePath.split(/[\\/]/)
      const workspaceName = pathChunks[pathChunks.length - 1] || workspacePath

      return {
        id: crypto.randomUUID(),
        name: workspaceName,
        path: workspacePath,
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workspaceEnsureDirectory,
    async (_event, payload: EnsureDirectoryInput) => {
      const normalized = normalizeEnsureDirectoryPayload(payload)
      await mkdir(normalized.path, { recursive: true })
    },
  )

  ipcMain.handle(IPC_CHANNELS.ptySpawn, async (_event, payload: SpawnTerminalInput) => {
    const { sessionId, pty } = ptyManager.spawnSession(payload)
    wirePtySessionEvents(sessionId, pty)

    return { sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.ptyWrite, async (_event, payload: WriteTerminalInput) => {
    ptyManager.write(payload.sessionId, payload.data)
  })

  ipcMain.handle(IPC_CHANNELS.ptyResize, async (_event, payload: ResizeTerminalInput) => {
    ptyManager.resize(payload.sessionId, payload.cols, payload.rows)
  })

  ipcMain.handle(IPC_CHANNELS.ptyKill, async (_event, payload: KillTerminalInput) => {
    terminalProbeBufferBySession.delete(payload.sessionId)
    ptyManager.kill(payload.sessionId)
  })

  ipcMain.handle(
    IPC_CHANNELS.ptySnapshot,
    async (_event, payload: SnapshotTerminalInput): Promise<SnapshotTerminalResult> => {
      const normalized = normalizeSnapshotPayload(payload)

      return {
        data: ptyManager.snapshot(normalized.sessionId),
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.agentListModels, async (_event, payload: ListAgentModelsInput) => {
    const normalized = normalizeListModelsPayload(payload)
    return await listAgentModels(normalized.provider)
  })

  ipcMain.handle(IPC_CHANNELS.agentLaunch, async (_event, payload: LaunchAgentInput) => {
    const normalized = normalizeLaunchAgentPayload(payload)

    const launchCommand = buildAgentLaunchCommand({
      provider: normalized.provider,
      mode: normalized.mode ?? 'new',
      prompt: normalized.prompt,
      model: normalized.model ?? null,
      resumeSessionId: normalized.resumeSessionId ?? null,
    })

    const testStub = resolveAgentTestStub(
      normalized.provider,
      launchCommand.effectiveModel,
      normalized.mode,
    )

    const launchStartedAtMs = Date.now()

    const { sessionId, pty } = ptyManager.spawnSession({
      cwd: normalized.cwd,
      cols: normalized.cols ?? 80,
      rows: normalized.rows ?? 24,
      command: testStub?.command ?? launchCommand.command,
      args: testStub?.args ?? launchCommand.args,
    })

    wirePtySessionEvents(sessionId, pty)

    let resumeSessionId = launchCommand.resumeSessionId

    if (process.env.NODE_ENV !== 'test') {
      const shouldDetectResumeSession =
        launchCommand.launchMode === 'new' ||
        (launchCommand.launchMode === 'resume' && resumeSessionId === null)

      if (shouldDetectResumeSession) {
        const detectedSessionId = await locateAgentResumeSessionId({
          provider: normalized.provider,
          cwd: normalized.cwd,
          startedAtMs: launchStartedAtMs,
        })

        if (detectedSessionId) {
          resumeSessionId = detectedSessionId
        }
      }
    }

    const result: LaunchAgentResult = {
      sessionId,
      provider: normalized.provider,
      command: launchCommand.command,
      args: launchCommand.args,
      launchMode: launchCommand.launchMode,
      effectiveModel: launchCommand.effectiveModel,
      resumeSessionId,
    }

    return result
  })

  ipcMain.handle(
    IPC_CHANNELS.taskSuggestTitle,
    async (_event, payload: SuggestTaskTitleInput): Promise<SuggestTaskTitleResult> => {
      const normalized = normalizeSuggestTaskTitlePayload(payload)
      return await suggestTaskTitle(normalized)
    },
  )

  return {
    dispose: () => {
      ptyManager.disposeAll()
      ipcMain.removeHandler(IPC_CHANNELS.workspaceSelectDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.workspaceEnsureDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.ptySpawn)
      ipcMain.removeHandler(IPC_CHANNELS.ptyWrite)
      ipcMain.removeHandler(IPC_CHANNELS.ptyResize)
      ipcMain.removeHandler(IPC_CHANNELS.ptyKill)
      ipcMain.removeHandler(IPC_CHANNELS.ptySnapshot)
      ipcMain.removeHandler(IPC_CHANNELS.agentListModels)
      ipcMain.removeHandler(IPC_CHANNELS.agentLaunch)
      ipcMain.removeHandler(IPC_CHANNELS.taskSuggestTitle)
    },
  }
}
