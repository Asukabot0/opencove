import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc/channels'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import type { PtyRuntime } from '../../../terminal/presentation/main-ipc/runtime'
import type { RemoteTargetRepository } from '../../domain/RemoteTargetRepository'
import { connectSsh } from '../../application/ConnectSsh'
import type { SshSessionCreator } from '../../application/ConnectSsh'
import {
  listTargets,
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,
} from '../../application/ManageRemoteTargets'
import { importSshConfig } from '../../application/ImportSshConfig'
import {
  validateCreateTarget,
  validateUpdateTarget,
  validateDeleteTarget,
  validateImportSshConfig,
} from './validate'

export function registerRemoteIpcHandlers(
  getRepo: () => Promise<RemoteTargetRepository>,
): IpcRegistrationDisposable {
  ipcMain.handle(IPC_CHANNELS.remoteListTargets, async (_event, workspaceId: string) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      return []
    }
    const repo = await getRepo()
    return listTargets(repo, workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.remoteGetTarget, async (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return null
    }
    const repo = await getRepo()
    return getTarget(repo, id)
  })

  ipcMain.handle(IPC_CHANNELS.remoteCreateTarget, async (_event, input: unknown) => {
    const validated = validateCreateTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid create target payload' }
    }
    const repo = await getRepo()
    return createTarget(repo, validated)
  })

  ipcMain.handle(IPC_CHANNELS.remoteUpdateTarget, async (_event, input: unknown) => {
    const validated = validateUpdateTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid update target payload' }
    }
    const repo = await getRepo()
    return updateTarget(repo, validated)
  })

  ipcMain.handle(IPC_CHANNELS.remoteDeleteTarget, async (_event, input: unknown) => {
    const validated = validateDeleteTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid delete target payload' }
    }
    const repo = await getRepo()
    return deleteTarget(repo, validated.id, validated.force)
  })

  ipcMain.handle(IPC_CHANNELS.remoteImportSshConfig, async (_event, input: unknown) => {
    const validated = validateImportSshConfig(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid import config payload' }
    }
    const repo = await getRepo()
    return importSshConfig(
      repo,
      validated.workspaceId,
      validated.configPath,
      validated.conflictStrategy,
    )
  })

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.remoteListTargets)
      ipcMain.removeHandler(IPC_CHANNELS.remoteGetTarget)
      ipcMain.removeHandler(IPC_CHANNELS.remoteCreateTarget)
      ipcMain.removeHandler(IPC_CHANNELS.remoteUpdateTarget)
      ipcMain.removeHandler(IPC_CHANNELS.remoteDeleteTarget)
      ipcMain.removeHandler(IPC_CHANNELS.remoteImportSshConfig)
    },
  }
}

export function registerSshConnectHandler(
  getRepo: () => Promise<RemoteTargetRepository>,
  ptyRuntime: PtyRuntime,
): IpcRegistrationDisposable {
  ipcMain.handle(IPC_CHANNELS.sshConnect, async (event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof (input as Record<string, unknown>).targetId !== 'string' ||
      !(input as Record<string, unknown>).targetId
    ) {
      return { error: 'unknown', message: 'Invalid ssh connect payload: targetId required' }
    }

    const payload = input as { targetId: string; cols?: number; rows?: number }
    const cols = typeof payload.cols === 'number' && payload.cols > 0 ? payload.cols : 80
    const rows = typeof payload.rows === 'number' && payload.rows > 0 ? payload.rows : 24

    const targetId = payload.targetId

    // Register credential resolver scoped to the requesting WebContents
    ptyRuntime.registerSshCredentialResolver(targetId, event.sender)

    const sessionCreator: SshSessionCreator = {
      async createSshSession(opts) {
        const result = await ptyRuntime.openSshSession({
          sessionKind: 'ssh',
          targetId: opts.targetId,
          sshHost: opts.host,
          sshPort: opts.port,
          sshUsername: opts.username,
          sshAuthMethod: opts.authMethod,
          sshKeyPath: opts.keyPath ?? undefined,
          sshForwardAgent: opts.forwardAgent,
          connectTimeout: opts.connectTimeout,
          cols: opts.cols,
          rows: opts.rows,
        })
        return { sessionId: result.sessionId }
      },
    }

    try {
      const repo = await getRepo()
      const result = await connectSsh(repo, sessionCreator, { targetId, cols, rows })

      if ('sessionId' in result) {
        ptyRuntime.emitSshConnectionState({
          sessionId: result.sessionId,
          state: 'connected',
        })
      }

      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { error: 'unknown', message }
    } finally {
      ptyRuntime.unregisterSshCredentialResolver(targetId)
    }
  })

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.sshConnect)
    },
  }
}
