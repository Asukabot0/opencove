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

export function registerRemoteIpcHandlers(repo: RemoteTargetRepository): void {
  ipcMain.handle(IPC_CHANNELS.remoteListTargets, (_event, workspaceId: string) => {
    if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
      return []
    }
    return listTargets(repo, workspaceId)
  })

  ipcMain.handle(IPC_CHANNELS.remoteGetTarget, (_event, id: string) => {
    if (typeof id !== 'string' || !id.trim()) {
      return null
    }
    return getTarget(repo, id)
  })

  ipcMain.handle(IPC_CHANNELS.remoteCreateTarget, (_event, input: unknown) => {
    const validated = validateCreateTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid create target payload' }
    }
    return createTarget(repo, validated)
  })

  ipcMain.handle(IPC_CHANNELS.remoteUpdateTarget, (_event, input: unknown) => {
    const validated = validateUpdateTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid update target payload' }
    }
    return updateTarget(repo, validated)
  })

  ipcMain.handle(IPC_CHANNELS.remoteDeleteTarget, (_event, input: unknown) => {
    const validated = validateDeleteTarget(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid delete target payload' }
    }
    return deleteTarget(repo, validated.id, validated.force)
  })

  ipcMain.handle(IPC_CHANNELS.remoteImportSshConfig, (_event, input: unknown) => {
    const validated = validateImportSshConfig(input)
    if (!validated) {
      return { error: 'invalid_input', message: 'Invalid import config payload' }
    }
    return importSshConfig(
      repo,
      validated.workspaceId,
      validated.configPath,
      validated.conflictStrategy,
    )
  })
}
