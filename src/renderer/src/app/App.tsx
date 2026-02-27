import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SettingsPanel } from '../features/settings/components/SettingsPanel'
import {
  AGENT_PROVIDER_LABEL,
  DEFAULT_AGENT_SETTINGS,
  resolveAgentModel,
  type AgentSettings,
} from '../features/settings/agentConfig'
import { WorkspaceCanvas } from '../features/workspace/components/WorkspaceCanvas'
import type { WorkspaceViewport, WorkspaceState } from '../features/workspace/types'
import { DEFAULT_WORKSPACE_MINIMAP_VISIBLE } from '../features/workspace/types'
import { toPersistedState } from '../features/workspace/utils/persistence'
import { DeleteProjectDialog } from './components/DeleteProjectDialog'
import { ProjectContextMenu } from './components/ProjectContextMenu'
import { Sidebar } from './components/Sidebar'
import { useHydrateAppState } from './hooks/useHydrateAppState'
import { usePersistedAppState } from './hooks/usePersistedAppState'
import { useProjectContextMenuDismiss } from './hooks/useProjectContextMenuDismiss'
import { useProviderModelCatalog } from './hooks/useProviderModelCatalog'
import type { FocusRequest, ProjectContextMenuState, ProjectDeleteConfirmationState } from './types'
import { createDefaultWorkspaceViewport, sanitizeWorkspaceSpaces } from './utils/workspaceSpaces'

export default function App(): React.JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenuState | null>(null)
  const [projectDeleteConfirmation, setProjectDeleteConfirmation] =
    useState<ProjectDeleteConfirmationState | null>(null)
  const [isRemovingProject, setIsRemovingProject] = useState(false)
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  const { isHydrated } = useHydrateAppState({
    setAgentSettings,
    setWorkspaces,
    setActiveWorkspaceId,
  })

  const { providerModelCatalog, refreshProviderModels } = useProviderModelCatalog({
    isSettingsOpen,
  })

  const workspacesRef = useRef(workspaces)
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  const agentSettingsRef = useRef(agentSettings)

  workspacesRef.current = workspaces
  activeWorkspaceIdRef.current = activeWorkspaceId
  agentSettingsRef.current = agentSettings

  useEffect(() => {
    const root = document.documentElement
    const uiFontScale = (agentSettings.uiFontSize / 16).toFixed(2)
    root.style.setProperty('--cove-ui-font-scale', uiFontScale)
  }, [agentSettings.uiFontSize])

  const producePersistedState = useCallback(
    () =>
      toPersistedState(
        workspacesRef.current,
        activeWorkspaceIdRef.current,
        agentSettingsRef.current,
      ),
    [],
  )

  const { persistNotice, requestPersistFlush, flushPersistNow } = usePersistedAppState({
    workspaces,
    activeWorkspaceId,
    agentSettings,
    isHydrated,
    producePersistedState,
  })

  const activeWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  )

  const activeProviderLabel = AGENT_PROVIDER_LABEL[agentSettings.defaultProvider]
  const activeProviderModel =
    resolveAgentModel(agentSettings, agentSettings.defaultProvider) ?? 'Default (Follow CLI)'

  const handleAddWorkspace = useCallback(async (): Promise<void> => {
    const selected = await window.coveApi.workspace.selectDirectory()
    if (!selected) {
      return
    }

    const existing = workspacesRef.current.find(workspace => workspace.path === selected.path)
    if (existing) {
      setActiveWorkspaceId(existing.id)
      return
    }

    const nextWorkspace: WorkspaceState = {
      ...selected,
      nodes: [],
      worktreesRoot: '',
      viewport: createDefaultWorkspaceViewport(),
      isMinimapVisible: DEFAULT_WORKSPACE_MINIMAP_VISIBLE,
      spaces: [],
      activeSpaceId: null,
    }

    setWorkspaces(prev => [...prev, nextWorkspace])
    setActiveWorkspaceId(nextWorkspace.id)
    setFocusRequest(null)
  }, [])

  const handleWorkspaceNodesChange = useCallback(
    (nodes: WorkspaceState['nodes']): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(prev =>
        prev.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          const nodeIds = new Set(nodes.map(node => node.id))
          const nextSpaces = sanitizeWorkspaceSpaces(
            workspace.spaces.map(space => ({
              ...space,
              nodeIds: space.nodeIds.filter(nodeId => nodeIds.has(nodeId)),
            })),
          )
          const hasActiveSpace =
            workspace.activeSpaceId !== null &&
            nextSpaces.some(space => space.id === workspace.activeSpaceId)

          return {
            ...workspace,
            nodes,
            spaces: nextSpaces,
            activeSpaceId: hasActiveSpace ? workspace.activeSpaceId : null,
          }
        }),
      )
    },
    [activeWorkspace],
  )

  const handleWorkspaceViewportChange = useCallback(
    (viewport: WorkspaceViewport): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          if (
            workspace.viewport.x === viewport.x &&
            workspace.viewport.y === viewport.y &&
            workspace.viewport.zoom === viewport.zoom
          ) {
            return workspace
          }

          return {
            ...workspace,
            viewport: {
              x: viewport.x,
              y: viewport.y,
              zoom: viewport.zoom,
            },
          }
        }),
      )
    },
    [activeWorkspace],
  )

  const handleWorkspaceMinimapVisibilityChange = useCallback(
    (isVisible: boolean): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          if (workspace.isMinimapVisible === isVisible) {
            return workspace
          }

          return {
            ...workspace,
            isMinimapVisible: isVisible,
          }
        }),
      )
    },
    [activeWorkspace],
  )

  const handleWorkspaceSpacesChange = useCallback(
    (spaces: WorkspaceState['spaces']): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          const sanitizedSpaces = sanitizeWorkspaceSpaces(spaces)
          const hasActiveSpace =
            workspace.activeSpaceId !== null &&
            sanitizedSpaces.some(space => space.id === workspace.activeSpaceId)

          return {
            ...workspace,
            spaces: sanitizedSpaces,
            activeSpaceId: hasActiveSpace ? workspace.activeSpaceId : null,
          }
        }),
      )
    },
    [activeWorkspace],
  )

  const handleWorkspaceActiveSpaceChange = useCallback(
    (spaceId: string | null): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          const hasTargetSpace =
            spaceId !== null && workspace.spaces.some(space => space.id === spaceId)
          const nextSpaceId = hasTargetSpace ? spaceId : null
          if (workspace.activeSpaceId === nextSpaceId) {
            return workspace
          }

          return {
            ...workspace,
            activeSpaceId: nextSpaceId,
          }
        }),
      )
    },
    [activeWorkspace],
  )

  const handleWorkspaceWorktreesRootChange = useCallback(
    (worktreesRoot: string): void => {
      if (!activeWorkspace) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== activeWorkspace.id) {
            return workspace
          }

          if (workspace.worktreesRoot === worktreesRoot) {
            return workspace
          }

          return {
            ...workspace,
            worktreesRoot,
          }
        }),
      )

      requestPersistFlush()
    },
    [activeWorkspace, requestPersistFlush],
  )

  const handleRemoveWorkspace = useCallback(async (workspaceId: string): Promise<void> => {
    setIsRemovingProject(true)

    const targetWorkspace = workspacesRef.current.find(workspace => workspace.id === workspaceId)
    if (!targetWorkspace) {
      setProjectDeleteConfirmation(null)
      setIsRemovingProject(false)
      return
    }

    try {
      await Promise.allSettled(
        targetWorkspace.nodes
          .map(node => node.data.sessionId)
          .filter(sessionId => sessionId.length > 0)
          .map(sessionId => window.coveApi.pty.kill({ sessionId })),
      )

      const nextWorkspaces = workspacesRef.current.filter(workspace => workspace.id !== workspaceId)
      setWorkspaces(nextWorkspaces)
      setActiveWorkspaceId(currentActiveId =>
        currentActiveId === workspaceId ? (nextWorkspaces[0]?.id ?? null) : currentActiveId,
      )
      setFocusRequest(null)
      setProjectDeleteConfirmation(null)
    } finally {
      setIsRemovingProject(false)
    }
  }, [])

  useProjectContextMenuDismiss({
    projectContextMenu,
    setProjectContextMenu,
  })

  const handleSelectWorkspace = useCallback((workspaceId: string): void => {
    setActiveWorkspaceId(workspaceId)
    setFocusRequest(null)
  }, [])

  const handleSelectAgentNode = useCallback((workspaceId: string, nodeId: string): void => {
    setActiveWorkspaceId(workspaceId)
    setFocusRequest(prev => ({
      workspaceId,
      nodeId,
      sequence: (prev?.sequence ?? 0) + 1,
    }))
  }, [])

  const handleRequestRemoveProject = useCallback((workspaceId: string): void => {
    const targetWorkspace = workspacesRef.current.find(workspace => workspace.id === workspaceId)
    if (!targetWorkspace) {
      setProjectContextMenu(null)
      return
    }

    setProjectDeleteConfirmation({
      workspaceId: targetWorkspace.id,
      workspaceName: targetWorkspace.name,
    })
    setProjectContextMenu(null)
  }, [])

  return (
    <>
      <div className="app-shell">
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeProviderLabel={activeProviderLabel}
          activeProviderModel={activeProviderModel}
          persistNotice={persistNotice}
          onAddWorkspace={() => {
            void handleAddWorkspace()
          }}
          onSelectWorkspace={workspaceId => {
            handleSelectWorkspace(workspaceId)
          }}
          onOpenProjectContextMenu={(state: ProjectContextMenuState) => {
            setProjectContextMenu(state)
          }}
          onSelectAgentNode={(workspaceId, nodeId) => {
            handleSelectAgentNode(workspaceId, nodeId)
          }}
          onOpenSettings={() => {
            setIsSettingsOpen(true)
          }}
        />

        <main className="workspace-main">
          {activeWorkspace ? (
            <WorkspaceCanvas
              workspaceId={activeWorkspace.id}
              workspacePath={activeWorkspace.path}
              worktreesRoot={activeWorkspace.worktreesRoot}
              nodes={activeWorkspace.nodes}
              onNodesChange={handleWorkspaceNodesChange}
              onRequestPersistFlush={requestPersistFlush}
              viewport={activeWorkspace.viewport}
              isMinimapVisible={activeWorkspace.isMinimapVisible}
              onViewportChange={handleWorkspaceViewportChange}
              onMinimapVisibilityChange={handleWorkspaceMinimapVisibilityChange}
              spaces={activeWorkspace.spaces}
              activeSpaceId={activeWorkspace.activeSpaceId}
              onSpacesChange={handleWorkspaceSpacesChange}
              onActiveSpaceChange={handleWorkspaceActiveSpaceChange}
              agentSettings={agentSettings}
              focusNodeId={
                focusRequest && focusRequest.workspaceId === activeWorkspace.id
                  ? focusRequest.nodeId
                  : null
              }
              focusSequence={
                focusRequest && focusRequest.workspaceId === activeWorkspace.id
                  ? focusRequest.sequence
                  : 0
              }
            />
          ) : (
            <div className="workspace-empty-state">
              <h2>Add a project to start</h2>
              <p>Each project has its own infinite canvas and terminals.</p>
              <button type="button" onClick={() => void handleAddWorkspace()}>
                Add Project
              </button>
            </div>
          )}
        </main>
      </div>

      {projectContextMenu ? (
        <ProjectContextMenu
          workspaceId={projectContextMenu.workspaceId}
          x={projectContextMenu.x}
          y={projectContextMenu.y}
          onRequestRemove={workspaceId => {
            handleRequestRemoveProject(workspaceId)
          }}
        />
      ) : null}

      {projectDeleteConfirmation ? (
        <DeleteProjectDialog
          workspaceName={projectDeleteConfirmation.workspaceName}
          isRemoving={isRemovingProject}
          onCancel={() => {
            setProjectDeleteConfirmation(null)
          }}
          onConfirm={() => {
            void handleRemoveWorkspace(projectDeleteConfirmation.workspaceId)
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <SettingsPanel
          settings={agentSettings}
          modelCatalogByProvider={providerModelCatalog}
          activeWorkspaceName={activeWorkspace?.name ?? null}
          activeWorkspacePath={activeWorkspace?.path ?? null}
          activeWorkspaceWorktreesRoot={activeWorkspace?.worktreesRoot ?? ''}
          onChangeActiveWorkspaceWorktreesRoot={worktreesRoot => {
            handleWorkspaceWorktreesRootChange(worktreesRoot)
          }}
          onRefreshProviderModels={provider => {
            void refreshProviderModels(provider)
          }}
          onChange={next => {
            setAgentSettings(next)
          }}
          onClose={() => {
            setIsSettingsOpen(false)
            flushPersistNow()
          }}
        />
      ) : null}
    </>
  )
}
