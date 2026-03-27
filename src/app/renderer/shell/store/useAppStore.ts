import { create } from 'zustand'
import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { WorkspaceState } from '@contexts/workspace/presentation/renderer/types'
import type {
  FocusRequest,
  PersistNotice,
  ProjectContextMenuState,
  ProjectDeleteConfirmationState,
} from '../types'

type SetStateAction<T> = T | ((prev: T) => T)

function applySetStateAction<T>(previous: T, action: SetStateAction<T>): T {
  return typeof action === 'function' ? (action as (prev: T) => T)(previous) : action
}

export interface PendingSshSession {
  sessionId: string
  targetName: string
  targetId: string
}

export interface AppStoreState {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  projectContextMenu: ProjectContextMenuState | null
  projectDeleteConfirmation: ProjectDeleteConfirmationState | null
  isRemovingProject: boolean
  agentSettings: AgentSettings
  isSettingsOpen: boolean
  focusRequest: FocusRequest | null
  persistNotice: PersistNotice | null
  pendingSshSession: PendingSshSession | null

  setWorkspaces: (action: SetStateAction<WorkspaceState[]>) => void
  setActiveWorkspaceId: (action: SetStateAction<string | null>) => void
  setProjectContextMenu: (action: SetStateAction<ProjectContextMenuState | null>) => void
  setProjectDeleteConfirmation: (
    action: SetStateAction<ProjectDeleteConfirmationState | null>,
  ) => void
  setIsRemovingProject: (action: SetStateAction<boolean>) => void
  setAgentSettings: (action: SetStateAction<AgentSettings>) => void
  setIsSettingsOpen: (action: SetStateAction<boolean>) => void
  setFocusRequest: (action: SetStateAction<FocusRequest | null>) => void
  setPersistNotice: (action: SetStateAction<PersistNotice | null>) => void
  setPendingSshSession: (action: SetStateAction<PendingSshSession | null>) => void
}

export const useAppStore = create<AppStoreState>(set => ({
  workspaces: [],
  activeWorkspaceId: null,
  projectContextMenu: null,
  projectDeleteConfirmation: null,
  isRemovingProject: false,
  agentSettings: DEFAULT_AGENT_SETTINGS,
  isSettingsOpen: false,
  focusRequest: null,
  persistNotice: null,
  pendingSshSession: null,

  setWorkspaces: action =>
    set(state => ({ workspaces: applySetStateAction(state.workspaces, action) })),
  setActiveWorkspaceId: action =>
    set(state => ({ activeWorkspaceId: applySetStateAction(state.activeWorkspaceId, action) })),
  setProjectContextMenu: action =>
    set(state => ({ projectContextMenu: applySetStateAction(state.projectContextMenu, action) })),
  setProjectDeleteConfirmation: action =>
    set(state => ({
      projectDeleteConfirmation: applySetStateAction(state.projectDeleteConfirmation, action),
    })),
  setIsRemovingProject: action =>
    set(state => ({ isRemovingProject: applySetStateAction(state.isRemovingProject, action) })),
  setAgentSettings: action =>
    set(state => ({ agentSettings: applySetStateAction(state.agentSettings, action) })),
  setIsSettingsOpen: action =>
    set(state => ({ isSettingsOpen: applySetStateAction(state.isSettingsOpen, action) })),
  setFocusRequest: action =>
    set(state => ({ focusRequest: applySetStateAction(state.focusRequest, action) })),
  setPersistNotice: action =>
    set(state => ({ persistNotice: applySetStateAction(state.persistNotice, action) })),
  setPendingSshSession: action =>
    set(state => ({ pendingSshSession: applySetStateAction(state.pendingSshSession, action) })),
}))
