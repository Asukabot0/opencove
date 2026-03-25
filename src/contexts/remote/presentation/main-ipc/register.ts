import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc/channels'
import type { RemoteTargetRepository } from '../../domain/RemoteTargetRepository'
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

export function registerRemoteIpcHandlers(getRepo: () => Promise<RemoteTargetRepository>): void {
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
}
