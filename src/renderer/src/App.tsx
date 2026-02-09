import { useCallback, useEffect, useMemo, useState } from 'react'
import { SettingsPanel } from './features/settings/components/SettingsPanel'
import {
  AGENT_PROVIDERS,
  AGENT_PROVIDER_LABEL,
  DEFAULT_AGENT_SETTINGS,
  resolveAgentModel,
  type AgentProvider,
  type AgentSettings,
} from './features/settings/agentConfig'
import { WorkspaceCanvas } from './features/workspace/components/WorkspaceCanvas'
import type { WorkspaceState } from './features/workspace/types'
import {
  readPersistedState,
  toPersistedState,
  writePersistedState,
} from './features/workspace/utils/persistence'
import { toRuntimeNodes } from './features/workspace/utils/nodeTransform'

interface ProviderModelCatalogEntry {
  models: string[]
  source: string | null
  fetchedAt: string | null
  isLoading: boolean
  error: string | null
}

type ProviderModelCatalog = Record<AgentProvider, ProviderModelCatalogEntry>

interface FocusRequest {
  nodeId: string
  sequence: number
}

function createInitialModelCatalog(): ProviderModelCatalog {
  return {
    'claude-code': {
      models: [],
      source: null,
      fetchedAt: null,
      isLoading: false,
      error: null,
    },
    codex: {
      models: [],
      source: null,
      fetchedAt: null,
      isLoading: false,
      error: null,
    },
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Unknown error'
}

function toAgentNodeTitle(provider: AgentProvider, model: string | null): string {
  const providerTitle = provider === 'codex' ? 'codex' : 'claude'
  return `${providerTitle} · ${model ?? 'default-model'}`
}

function toRelativeTime(iso: string | null): string {
  if (!iso) {
    return 'just now'
  }

  const timestamp = Date.parse(iso)
  if (Number.isNaN(timestamp)) {
    return 'just now'
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (deltaSeconds < 60) {
    return 'just now'
  }

  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`
  }

  if (deltaSeconds < 86400) {
    return `${Math.floor(deltaSeconds / 3600)}h ago`
  }

  return `${Math.floor(deltaSeconds / 86400)}d ago`
}

function App(): JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS)
  const [providerModelCatalog, setProviderModelCatalog] = useState<ProviderModelCatalog>(() =>
    createInitialModelCatalog(),
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  useEffect(() => {
    const persisted = readPersistedState()
    if (!persisted) {
      setIsHydrated(true)
      return
    }

    setAgentSettings(persisted.settings)

    if (persisted.workspaces.length === 0) {
      setIsHydrated(true)
      return
    }

    const restore = async (): Promise<void> => {
      const restoredWorkspaces = await Promise.all(
        persisted.workspaces.map(async workspace => {
          const runtimeNodes = toRuntimeNodes(workspace)

          const hydratedNodeResults = await Promise.allSettled(
            runtimeNodes.map(async node => {
              if (node.data.kind === 'task') {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    sessionId: '',
                    status: null,
                    startedAt: null,
                    endedAt: null,
                    exitCode: null,
                    lastError: null,
                    scrollback: null,
                    agent: null,
                  },
                }
              }

              if (node.data.kind === 'agent' && node.data.agent) {
                try {
                  const restoredAgent = await window.coveApi.agent.launch({
                    provider: node.data.agent.provider,
                    cwd: node.data.agent.executionDirectory,
                    prompt: node.data.agent.prompt,
                    mode: 'resume',
                    model: node.data.agent.model,
                    resumeSessionId: node.data.agent.resumeSessionId,
                    cols: 80,
                    rows: 24,
                  })

                  return {
                    ...node,
                    data: {
                      ...node.data,
                      sessionId: restoredAgent.sessionId,
                      title: toAgentNodeTitle(
                        node.data.agent.provider,
                        restoredAgent.effectiveModel,
                      ),
                      status: 'running' as const,
                      endedAt: null,
                      exitCode: null,
                      lastError: null,
                      scrollback: node.data.scrollback,
                      startedAt: node.data.startedAt ?? new Date().toISOString(),
                      agent: {
                        ...node.data.agent,
                        effectiveModel: restoredAgent.effectiveModel,
                        launchMode: restoredAgent.launchMode,
                        resumeSessionId:
                          restoredAgent.resumeSessionId ?? node.data.agent.resumeSessionId,
                      },
                    },
                  }
                } catch (error) {
                  const fallback = await window.coveApi.pty.spawn({
                    cwd: workspace.path,
                    cols: 80,
                    rows: 24,
                  })

                  return {
                    ...node,
                    data: {
                      ...node.data,
                      sessionId: fallback.sessionId,
                      status: 'failed' as const,
                      endedAt: new Date().toISOString(),
                      exitCode: null,
                      lastError: `Resume failed: ${toErrorMessage(error)}`,
                      scrollback: node.data.scrollback,
                    },
                  }
                }
              }

              const spawned = await window.coveApi.pty.spawn({
                cwd: workspace.path,
                cols: 80,
                rows: 24,
              })

              return {
                ...node,
                data: {
                  ...node.data,
                  sessionId: spawned.sessionId,
                  kind: 'terminal' as const,
                  status: null,
                  startedAt: null,
                  endedAt: null,
                  exitCode: null,
                  lastError: null,
                  scrollback: node.data.scrollback,
                  agent: null,
                  task: null,
                },
              }
            }),
          )

          const hydratedNodes = hydratedNodeResults
            .filter((result): result is PromiseFulfilledResult<(typeof runtimeNodes)[number]> => {
              return result.status === 'fulfilled'
            })
            .map(result => result.value)

          return {
            id: workspace.id,
            name: workspace.name,
            path: workspace.path,
            nodes: hydratedNodes,
          }
        }),
      )

      setWorkspaces(restoredWorkspaces)

      const hasActive = restoredWorkspaces.some(
        workspace => workspace.id === persisted.activeWorkspaceId,
      )
      setActiveWorkspaceId(
        hasActive ? persisted.activeWorkspaceId : (restoredWorkspaces[0]?.id ?? null),
      )
    }

    void restore().finally(() => {
      setIsHydrated(true)
    })
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    writePersistedState(toPersistedState(workspaces, activeWorkspaceId, agentSettings))
  }, [activeWorkspaceId, agentSettings, isHydrated, workspaces])

  const refreshProviderModels = useCallback(async (provider: AgentProvider): Promise<void> => {
    setProviderModelCatalog(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        isLoading: true,
        error: null,
      },
    }))

    try {
      const result = await window.coveApi.agent.listModels({ provider })
      const nextModels = [...new Set(result.models.map(model => model.id))]

      setProviderModelCatalog(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          models: nextModels,
          source: result.source,
          fetchedAt: result.fetchedAt,
          error: result.error,
          isLoading: false,
        },
      }))
    } catch (error) {
      setProviderModelCatalog(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          isLoading: false,
          fetchedAt: new Date().toISOString(),
          error: toErrorMessage(error),
        },
      }))
    }
  }, [])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    for (const provider of AGENT_PROVIDERS) {
      const entry = providerModelCatalog[provider]
      if (entry.fetchedAt !== null || entry.isLoading) {
        continue
      }

      void refreshProviderModels(provider)
    }
  }, [isSettingsOpen, providerModelCatalog, refreshProviderModels])

  const activeWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  )

  const activeProviderLabel = AGENT_PROVIDER_LABEL[agentSettings.defaultProvider]
  const activeProviderModel =
    resolveAgentModel(agentSettings, agentSettings.defaultProvider) ?? 'Default (Follow CLI)'

  const activeWorkspaceAgents = useMemo(() => {
    if (!activeWorkspace) {
      return []
    }

    return activeWorkspace.nodes
      .filter(node => node.data.kind === 'agent')
      .sort((left, right) => {
        const leftTime = left.data.startedAt ? Date.parse(left.data.startedAt) : 0
        const rightTime = right.data.startedAt ? Date.parse(right.data.startedAt) : 0
        return rightTime - leftTime
      })
  }, [activeWorkspace])

  const handleAddWorkspace = async (): Promise<void> => {
    const selected = await window.coveApi.workspace.selectDirectory()
    if (!selected) {
      return
    }

    const existing = workspaces.find(workspace => workspace.path === selected.path)
    if (existing) {
      setActiveWorkspaceId(existing.id)
      return
    }

    const nextWorkspace: WorkspaceState = {
      ...selected,
      nodes: [],
    }

    setWorkspaces(prev => [...prev, nextWorkspace])
    setActiveWorkspaceId(nextWorkspace.id)
    setFocusRequest(null)
  }

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

          return {
            ...workspace,
            nodes,
          }
        }),
      )
    },
    [activeWorkspace],
  )

  return (
    <>
      <div className="app-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar__header">
            <h1>Workspaces</h1>
            <button type="button" onClick={() => void handleAddWorkspace()}>
              Add
            </button>
          </div>

          <div className="workspace-sidebar__agent">
            <span className="workspace-sidebar__agent-label">Default Agent</span>
            <strong className="workspace-sidebar__agent-provider">{activeProviderLabel}</strong>
            <span className="workspace-sidebar__agent-model">{activeProviderModel}</span>
          </div>

          <div className="workspace-sidebar__list">
            {workspaces.length === 0 ? (
              <p className="workspace-sidebar__empty">No workspace yet.</p>
            ) : null}

            {workspaces.map(workspace => {
              const isActive = workspace.id === activeWorkspaceId
              const terminalCount = workspace.nodes.filter(
                node => node.data.kind === 'terminal',
              ).length
              const agentCount = workspace.nodes.filter(node => node.data.kind === 'agent').length
              const taskCount = workspace.nodes.filter(node => node.data.kind === 'task').length
              const metaText = `${terminalCount} terminals · ${agentCount} agents · ${taskCount} tasks`

              return (
                <button
                  type="button"
                  key={workspace.id}
                  className={`workspace-item ${isActive ? 'workspace-item--active' : ''}`}
                  onClick={() => {
                    setActiveWorkspaceId(workspace.id)
                    setFocusRequest(null)
                  }}
                  title={workspace.path}
                >
                  <span className="workspace-item__name">{workspace.name}</span>
                  <span className="workspace-item__path">{workspace.path}</span>
                  <span className="workspace-item__meta">{metaText}</span>
                </button>
              )
            })}
          </div>

          <section className="workspace-sidebar__agents">
            <div className="workspace-sidebar__agents-header">
              <span>Agents</span>
              <span>{activeWorkspaceAgents.length}</span>
            </div>

            {activeWorkspaceAgents.length === 0 ? (
              <p className="workspace-sidebar__agents-empty">No agent sessions.</p>
            ) : (
              activeWorkspaceAgents.map(node => {
                const provider = node.data.agent?.provider
                const providerText = provider ? AGENT_PROVIDER_LABEL[provider] : 'Agent'
                const statusText = node.data.status ?? 'running'
                const startedText = toRelativeTime(node.data.startedAt)

                return (
                  <button
                    type="button"
                    key={node.id}
                    className="workspace-agent-item"
                    data-testid={`workspace-agent-item-${node.id}`}
                    onClick={() => {
                      setFocusRequest(prev => ({
                        nodeId: node.id,
                        sequence: (prev?.sequence ?? 0) + 1,
                      }))
                    }}
                  >
                    <span className="workspace-agent-item__title">{node.data.title}</span>
                    <span className="workspace-agent-item__meta">
                      {providerText} · {statusText} · {startedText}
                    </span>
                  </button>
                )
              })
            )}
          </section>

          <div className="workspace-sidebar__footer">
            <button
              type="button"
              className="workspace-sidebar__settings"
              onClick={() => {
                setIsSettingsOpen(true)
              }}
            >
              Settings
            </button>
          </div>
        </aside>

        <main className="workspace-main">
          {activeWorkspace ? (
            <WorkspaceCanvas
              workspacePath={activeWorkspace.path}
              nodes={activeWorkspace.nodes}
              onNodesChange={handleWorkspaceNodesChange}
              agentSettings={agentSettings}
              focusNodeId={focusRequest?.nodeId ?? null}
              focusSequence={focusRequest?.sequence ?? 0}
            />
          ) : (
            <div className="workspace-empty-state">
              <h2>Add a workspace to start</h2>
              <p>Each workspace has its own infinite canvas and terminals.</p>
              <button type="button" onClick={() => void handleAddWorkspace()}>
                Add Workspace
              </button>
            </div>
          )}
        </main>
      </div>

      {isSettingsOpen ? (
        <SettingsPanel
          settings={agentSettings}
          modelCatalogByProvider={providerModelCatalog}
          onRefreshProviderModels={provider => {
            void refreshProviderModels(provider)
          }}
          onChange={next => {
            setAgentSettings(next)
          }}
          onClose={() => {
            setIsSettingsOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

export default App
