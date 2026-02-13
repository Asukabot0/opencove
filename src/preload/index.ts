import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../shared/constants/ipc'
import type {
  EnsureDirectoryInput,
  KillTerminalInput,
  LaunchAgentInput,
  LaunchAgentResult,
  ListAgentModelsInput,
  ListAgentModelsResult,
  ResizeTerminalInput,
  SnapshotTerminalInput,
  SnapshotTerminalResult,
  SpawnTerminalInput,
  SuggestTaskTitleInput,
  SuggestTaskTitleResult,
  TerminalDataEvent,
  TerminalDoneEvent,
  TerminalExitEvent,
  WorkspaceDirectory,
  WriteTerminalInput,
} from '../shared/types/api'

type UnsubscribeFn = () => void

// Custom APIs for renderer
const coveApi = {
  meta: {
    isTest: process.env.NODE_ENV === 'test',
  },
  workspace: {
    selectDirectory: (): Promise<WorkspaceDirectory | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceSelectDirectory),
    ensureDirectory: (payload: EnsureDirectoryInput): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.workspaceEnsureDirectory, payload),
  },
  pty: {
    spawn: (payload: SpawnTerminalInput): Promise<{ sessionId: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ptySpawn, payload),
    write: (payload: WriteTerminalInput): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ptyWrite, payload),
    resize: (payload: ResizeTerminalInput): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ptyResize, payload),
    kill: (payload: KillTerminalInput): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ptyKill, payload),
    snapshot: (payload: SnapshotTerminalInput): Promise<SnapshotTerminalResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.ptySnapshot, payload),
    onData: (listener: (event: TerminalDataEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyData, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyData, handler)
      }
    },
    onExit: (listener: (event: TerminalExitEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyExit, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyExit, handler)
      }
    },
    onDone: (listener: (event: TerminalDoneEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalDoneEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyDone, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyDone, handler)
      }
    },
  },
  agent: {
    listModels: (payload: ListAgentModelsInput): Promise<ListAgentModelsResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentListModels, payload),
    launch: (payload: LaunchAgentInput): Promise<LaunchAgentResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.agentLaunch, payload),
  },
  task: {
    suggestTitle: (payload: SuggestTaskTitleInput): Promise<SuggestTaskTitleResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.taskSuggestTitle, payload),
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('coveApi', coveApi)
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.coveApi = coveApi
}
