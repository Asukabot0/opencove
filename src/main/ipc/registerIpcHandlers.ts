import { dialog, ipcMain, webContents } from 'electron'
import { basename, resolve } from 'node:path'
import { IPC_CHANNELS } from '../../shared/constants/ipc'
import type {
  KillTerminalInput,
  ResizeTerminalInput,
  SpawnTerminalInput,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceDirectory,
  WriteTerminalInput,
} from '../../shared/types/api'
import { PtyManager } from '../infrastructure/pty/PtyManager'

export interface IpcRegistrationDisposable {
  dispose: () => void
}

export function registerIpcHandlers(): IpcRegistrationDisposable {
  const ptyManager = new PtyManager()

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

  ipcMain.handle(IPC_CHANNELS.ptySpawn, async (_event, payload: SpawnTerminalInput) => {
    const { sessionId, pty } = ptyManager.spawnSession(payload)

    pty.onData(data => {
      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalDataEvent = { sessionId, data }
        content.send(IPC_CHANNELS.ptyData, eventPayload)
      })
    })

    pty.onExit(exit => {
      ptyManager.delete(sessionId)
      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalExitEvent = {
          sessionId,
          exitCode: exit.exitCode,
        }
        content.send(IPC_CHANNELS.ptyExit, eventPayload)
      })
    })

    return { sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.ptyWrite, async (_event, payload: WriteTerminalInput) => {
    ptyManager.write(payload.sessionId, payload.data)
  })

  ipcMain.handle(IPC_CHANNELS.ptyResize, async (_event, payload: ResizeTerminalInput) => {
    ptyManager.resize(payload.sessionId, payload.cols, payload.rows)
  })

  ipcMain.handle(IPC_CHANNELS.ptyKill, async (_event, payload: KillTerminalInput) => {
    ptyManager.kill(payload.sessionId)
  })

  return {
    dispose: () => {
      ptyManager.disposeAll()
      ipcMain.removeHandler(IPC_CHANNELS.workspaceSelectDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.ptySpawn)
      ipcMain.removeHandler(IPC_CHANNELS.ptyWrite)
      ipcMain.removeHandler(IPC_CHANNELS.ptyResize)
      ipcMain.removeHandler(IPC_CHANNELS.ptyKill)
    },
  }
}
